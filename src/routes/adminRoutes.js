const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const { sqliteDb } = require("../db/sqlite");
const { pgPool } = require("../db/postgres");
const { requireAdmin } = require("../middleware/adminAuth");

const router = express.Router();

function normalizeRows(rows) {
  return rows
    .map((row) => ({
      email: String(row.email).trim().toLowerCase(),
      name: String(row.name).trim(),
      password_hash: String(row.password_hash),
      registered_at: new Date(row.registered_at).toISOString()
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function hashRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function onlyInA(a, b) {
  const bEmails = new Set(b.map((row) => row.email));
  return a.filter((row) => !bEmails.has(row.email)).map((row) => row.email);
}

router.post("/admin/backup-logico", requireAdmin, async (_req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve("./backups");
  const backupFile = path.join(backupDir, `backup-logico-${timestamp}.json`);

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const sqliteRowsRaw = sqliteDb
      .prepare("SELECT name, email, password_hash, registered_at FROM users")
      .all();
    const sqliteRows = normalizeRows(sqliteRowsRaw);

    const pgResult = await pgPool.query("SELECT name, email, password_hash, registered_at FROM users");
    const postgresRows = normalizeRows(pgResult.rows);

    const sqliteHash = hashRows(sqliteRows);
    const postgresHash = hashRows(postgresRows);

    const validation = {
      sqlite_count: sqliteRows.length,
      postgres_count: postgresRows.length,
      sqlite_hash: sqliteHash,
      postgres_hash: postgresHash,
      counts_match: sqliteRows.length === postgresRows.length,
      hashes_match: sqliteHash === postgresHash,
      only_in_sqlite: onlyInA(sqliteRows, postgresRows),
      only_in_postgres: onlyInA(postgresRows, sqliteRows)
    };

    const payload = {
      generated_at: new Date().toISOString(),
      generated_by_role: "admin",
      source: {
        sqlite: sqliteRows,
        postgres: postgresRows
      },
      validation
    };

    fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), "utf8");

    return res.status(201).json({
      message: "Backup lógico generado correctamente",
      file: backupFile,
      validation
    });
  } catch (error) {
    console.error("Error en /admin/backup-logico:", error);
    return res.status(500).json({ error: "No se pudo generar el backup lógico" });
  }
});

router.get("/admin/usuarios-recientes", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);

    const sqliteResult = sqliteDb
      .prepare(
        `SELECT name, email, registered_at
         FROM users
         ORDER BY registered_at DESC
         LIMIT ?`
      )
      .all(limit);

    const pgResult = await pgPool.query(
      `SELECT name, email, registered_at
       FROM users
       ORDER BY registered_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.status(200).json({
      limit,
      sqlite: sqliteResult,
      postgres: pgResult.rows,
      note: "Consulta de usuarios recientes diseñada para aprovechar el índice idx_users_registered_at"
    });
  } catch (error) {
    console.error("Error en /admin/usuarios-recientes:", error);
    return res.status(500).json({ error: "No se pudieron consultar los usuarios recientes" });
  }
});

module.exports = router;
