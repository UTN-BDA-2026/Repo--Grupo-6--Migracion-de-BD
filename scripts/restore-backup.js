require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { sqliteDb, initSqlite } = require("../src/db/sqlite");
const { pgPool, initPostgres } = require("../src/db/postgres");

async function restoreBackup() {
  initSqlite();
  await initPostgres();

  const backupDir = path.resolve(__dirname, "../backups");
  
  if (!fs.existsSync(backupDir)) {
    console.log("No hay directorio de backups.");
    process.exit(0);
  }

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log("No hay backups disponibles.");
    process.exit(0);
  }

  const latestBackup = files[0];
  console.log(`Restaurando desde el backup: ${latestBackup}`);
  
  const backupPath = path.join(backupDir, latestBackup);
  const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));

  const users = backupData.source.postgres || backupData.source.sqlite;

  if (!users) {
    console.error("El backup no tiene formato válido.");
    process.exit(1);
  }

  // Restore SQLite
  console.log("Limpiando DB SQLite...");
  sqliteDb.prepare("DELETE FROM users").run();
  const insertSqlite = sqliteDb.prepare(`
    INSERT INTO users (name, email, password_hash, registered_at, balance, version)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const runTransaction = sqliteDb.transaction((users) => {
    for (const user of users) {
      insertSqlite.run(
        user.name, 
        user.email, 
        user.password_hash, 
        user.registered_at, 
        user.balance || 100, 
        user.version || 1
      );
    }
  });
  runTransaction(users);
  console.log(`Restaurados ${users.length} usuarios en SQLite.`);

  // Restore Postgres
  console.log("Limpiando DB PostgreSQL...");
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");

    const insertPg = `
      INSERT INTO users (name, email, password_hash, registered_at, balance, version)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    for (const user of users) {
      await client.query(insertPg, [
        user.name,
        user.email,
        user.password_hash,
        user.registered_at,
        user.balance || 100,
        user.version || 1
      ]);
    }
    
    await client.query("COMMIT");
    console.log(`Restaurados ${users.length} usuarios en PostgreSQL.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error restaurando PostgreSQL:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pgPool.end();
  }
}

restoreBackup().catch(err => {
  console.error("Fallo inesperado:", err);
  process.exit(1);
});
