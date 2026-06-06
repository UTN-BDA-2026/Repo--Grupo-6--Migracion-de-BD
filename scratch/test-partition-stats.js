require("dotenv").config();
const { pgPool } = require("../src/db/postgres");

async function main() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT name, email, registered_at, c.relname as partition_name
      FROM users u
      JOIN pg_class c ON u.tableoid = c.oid
      ORDER BY registered_at ASC
    `);
    console.log("Usuarios en PostgreSQL y su Partición Física:");
    res.rows.forEach(r => {
      console.log(` - ${r.name} (${r.email}) -> Partición: ${r.partition_name} (Fecha: ${r.registered_at.toISOString()})`);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.release();
    await pgPool.end();
  }
}

main();
