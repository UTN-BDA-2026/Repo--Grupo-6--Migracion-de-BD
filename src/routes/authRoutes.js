const express = require("express");
const bcrypt = require("bcryptjs");
const { sqliteDb } = require("../db/sqlite");
const { pgPool } = require("../db/postgres");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email y password son obligatorios" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(String(password), 10);
    const registeredAt = new Date().toISOString();

    const insertStmt = sqliteDb.prepare(`
      INSERT INTO users (name, email, password_hash, registered_at)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertStmt.run(String(name).trim(), normalizedEmail, passwordHash, registeredAt);

    return res.status(201).json({
      id: result.lastInsertRowid,
      name: String(name).trim(),
      email: normalizedEmail,
      registered_at: registeredAt
    });
  } catch (error) {
    if (error && String(error.message).includes("UNIQUE constraint failed: users.email")) {
      return res.status(409).json({ error: "El correo ya existe en SQLite" });
    }

    console.error("Error en /register:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email y password son obligatorios" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const sqliteUser = sqliteDb
      .prepare("SELECT id, name, email, password_hash, registered_at FROM users WHERE email = ?")
      .get(normalizedEmail);

    const pgResult = await pgPool.query(
      "SELECT id, name, email, password_hash, registered_at FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    const pgUser = pgResult.rows[0];

    if (!sqliteUser || !pgUser) {
      return res.status(401).json({ error: "Hubo un error en su correo o contraseña. Inténtelo de nuevo." });
    }

    const sqlitePasswordOk = await bcrypt.compare(String(password), sqliteUser.password_hash);
    const pgPasswordOk = await bcrypt.compare(String(password), pgUser.password_hash);

    const usersAreInSync =
      String(sqliteUser.email).toLowerCase() === String(pgUser.email).toLowerCase() &&
      sqliteUser.password_hash === pgUser.password_hash;

    if (!sqlitePasswordOk || !pgPasswordOk || !usersAreInSync) {
      return res.status(401).json({ error: "Hubo un error en su correo o contraseña. Inténtelo de nuevo." });
    }

    return res.status(200).json({
      message: "Inicio de sesión exitoso.",
      user: {
        name: sqliteUser.name,
        email: sqliteUser.email
      }
    });
  } catch (error) {
    console.error("Error en /login:", error);
    return res.status(401).json({ error: "Hubo un error en su correo o contraseña. Inténtelo de nuevo." });
  }
});

router.post("/forgot-password", (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "email es obligatorio" });
  }

  return res.status(200).json({
    message: "Funcionalidad de recuperación de contraseña pendiente. Contacte al administrador."
  });
});

module.exports = router;
