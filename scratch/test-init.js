require("dotenv").config();
const { initSqlite, sqliteDb } = require("../src/db/sqlite");
const { initPostgres, pgPool } = require("../src/db/postgres");

async function main() {
  try {
    console.log("Inicializando SQLite...");
    initSqlite();
    console.log("SQLite inicializado!");

    // Check table info in SQLite
    const sqliteInfo = sqliteDb.prepare("PRAGMA table_info(users)").all();
    console.log("Columnas de users en SQLite:", sqliteInfo.map(c => `${c.name} (${c.type})`));

    console.log("Inicializando PostgreSQL...");
    await initPostgres();
    console.log("PostgreSQL inicializado!");

    const client = await pgPool.connect();
    try {
      // Check tables in pg_class
      const res = await client.query(`
        SELECT relname, relkind 
        FROM pg_class 
        WHERE relname LIKE 'users%' AND relkind IN ('r', 'p')
        ORDER BY relname
      `);
      console.log("Tablas detectadas en PostgreSQL:");
      res.rows.forEach(r => {
        const type = r.relkind === 'p' ? 'Particionada' : 'Física/Partición';
        console.log(` - ${r.relname} [Tipo: ${type}]`);
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error durante la inicialización:", error);
  } finally {
    await pgPool.end();
  }
}

main();
