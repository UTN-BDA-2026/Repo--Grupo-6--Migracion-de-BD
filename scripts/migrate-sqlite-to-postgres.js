require("dotenv").config();

const { sqliteDb, initSqlite } = require("../src/db/sqlite");
const { pgPool, initPostgres } = require("../src/db/postgres");

async function migrateUsers() {
  initSqlite();
  await initPostgres();

  const users = sqliteDb.prepare("SELECT id, name, email, password_hash, registered_at, balance, version FROM users").all();

  if (users.length === 0) {
    console.log("No hay registros en SQLite para migrar.");
    return;
  }

  const client = await pgPool.connect();
  let inserted = 0;
  let skipped = 0;

  try {
    await client.query("BEGIN");

    const insertQuery = `
      INSERT INTO users (name, email, password_hash, registered_at, balance, version)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email, registered_at) DO NOTHING
      RETURNING id;
    `;

    for (const user of users) {
      const values = [
        String(user.name).trim(),
        String(user.email).trim().toLowerCase(),
        user.password_hash,
        new Date(user.registered_at),
        user.balance || 100,
        user.version || 1
      ];

      const result = await client.query(insertQuery, values);
      if (result.rowCount === 1) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }

    await client.query("COMMIT");
    console.log(`Migracion completada. Insertados: ${inserted}. Omitidos (duplicados): ${skipped}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error durante la migracion. Se hizo rollback:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pgPool.end();
  }
}

migrateUsers().catch((error) => {
  console.error("Fallo no controlado en la migracion:", error);
  process.exit(1);
});
