function createPostgresUserRepository(pgPool) {
  if (!pgPool) {
    throw new Error("pgPool is required");
  }

  async function findByEmail(email) {
    const { rows } = await pgPool.query(
      "SELECT id, name, email, password_hash, registered_at FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    return rows[0];
  }

  async function listAll() {
    const { rows } = await pgPool.query("SELECT name, email, password_hash, registered_at FROM users");
    return rows;
  }

  async function listRecent(limit) {
    const { rows } = await pgPool.query(
      `SELECT name, email, registered_at
       FROM users
       ORDER BY registered_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  return {
    findByEmail,
    listAll,
    listRecent
  };
}

module.exports = { createPostgresUserRepository };
