const { Pool } = require("pg");

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  database: process.env.POSTGRES_DB || "users_prod"
});

async function initPostgres() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT relkind FROM pg_class WHERE relname = 'users'
    `);

    if (res.rows.length > 0 && res.rows[0].relkind !== 'p') {
      console.log("Detectada tabla 'users' no particionada en PostgreSQL. Eliminándola para recrearla como particionada...");
      await client.query("DROP TABLE IF EXISTS users CASCADE");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160) NOT NULL,
        password_hash TEXT NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL,
        balance NUMERIC(12, 2) NOT NULL DEFAULT 100.00,
        version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (id, registered_at)
      ) PARTITION BY RANGE (registered_at);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_registered_at
        ON users (email, registered_at);

      CREATE TABLE IF NOT EXISTS users_old PARTITION OF users
        FOR VALUES FROM (MINVALUE) TO ('2026-01-01 00:00:00Z');

      CREATE TABLE IF NOT EXISTS users_2026 PARTITION OF users
        FOR VALUES FROM ('2026-01-01 00:00:00Z') TO ('2027-01-01 00:00:00Z');

      CREATE TABLE IF NOT EXISTS users_future PARTITION OF users
        FOR VALUES FROM ('2027-01-01 00:00:00Z') TO (MAXVALUE);

      CREATE INDEX IF NOT EXISTS idx_users_registered_at
        ON users (registered_at DESC);

      CREATE INDEX IF NOT EXISTS idx_users_name
        ON users (name);
    `);
    console.log("Base de datos PostgreSQL inicializada correctamente con particionado por rango y soporte de transacciones.");
  } catch (error) {
    console.error("Error al inicializar PostgreSQL:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pgPool,
  initPostgres
};
