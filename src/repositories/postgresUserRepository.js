function createPostgresUserRepository(pgPool) {
  if (!pgPool) {
    throw new Error("pgPool is required");
  }

  async function findByEmail(email) {
    const { rows } = await pgPool.query(
      "SELECT id, name, email, password_hash, registered_at, balance, version FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    return rows[0];
  }

  async function listAll() {
    const { rows } = await pgPool.query("SELECT name, email, password_hash, registered_at, balance, version FROM users");
    return rows;
  }

  async function listRecent(limit) {
    const { rows } = await pgPool.query(
      `SELECT name, email, registered_at, balance, version
       FROM users
       ORDER BY registered_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async function createUser({ name, email, passwordHash, registeredAt, balance = 100, version = 1 }) {
    const { rows } = await pgPool.query(
      `INSERT INTO users (name, email, password_hash, registered_at, balance, version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, email, passwordHash, registeredAt, balance, version]
    );
    return rows[0];
  }

  async function getPartitionInfo(email) {
    const { rows } = await pgPool.query(
      `SELECT c.relname AS partition_name
       FROM users u
       JOIN pg_class c ON u.tableoid = c.oid
       WHERE u.email = $1 LIMIT 1`,
      [email]
    );
    return rows[0] ? rows[0].partition_name : null;
  }

  async function getPartitionStats() {
    const { rows } = await pgPool.query(
      `SELECT 
         c.relname AS partition_name,
         count(u.id) AS row_count
       FROM pg_class c
       LEFT JOIN users u ON u.tableoid = c.oid
       WHERE c.relname IN ('users_old', 'users_2026', 'users_future')
       GROUP BY c.relname
       ORDER BY c.relname`
    );
    return rows;
  }

  return {
    findByEmail,
    listAll,
    listRecent,
    createUser,
    getPartitionInfo,
    getPartitionStats
  };
}

module.exports = { createPostgresUserRepository };
