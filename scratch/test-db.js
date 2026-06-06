require("dotenv").config();
const { pgPool } = require("../src/db/postgres");

async function main() {
  console.log("Intentando conectar a PostgreSQL...");
  console.log("Config: Host =", process.env.POSTGRES_HOST, ", Database =", process.env.POSTGRES_DB, ", Port =", process.env.POSTGRES_PORT);
  try {
    const client = await pgPool.connect();
    console.log("¡Conexión establecida correctamente!");
    const res = await client.query("SELECT version()");
    console.log("Versión de PostgreSQL:", res.rows[0].version);
    client.release();
  } catch (error) {
    console.error("Error al conectar a PostgreSQL:", error);
  } finally {
    await pgPool.end();
  }
}

main();
