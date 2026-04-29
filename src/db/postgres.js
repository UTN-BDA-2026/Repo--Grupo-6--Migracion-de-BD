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
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_registered_at
        ON users (registered_at DESC);

      CREATE INDEX IF NOT EXISTS idx_users_name
        ON users (name);
    `);
  } finally {
    client.release();
  }
}

module.exports = {
  pgPool,
  initPostgres
};
