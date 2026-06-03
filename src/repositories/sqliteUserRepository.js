function createSqliteUserRepository(sqliteDb) {
  if (!sqliteDb) {
    throw new Error("sqliteDb is required");
  }

  function createUser({ name, email, passwordHash, registeredAt }) {
    const stmt = sqliteDb.prepare(`
      INSERT INTO users (name, email, password_hash, registered_at)
      VALUES (?, ?, ?, ?)
    `);

    return stmt.run(name, email, passwordHash, registeredAt);
  }

  function findByEmail(email) {
    return sqliteDb
      .prepare("SELECT id, name, email, password_hash, registered_at FROM users WHERE email = ?")
      .get(email);
  }

  function listAll() {
    return sqliteDb
      .prepare("SELECT name, email, password_hash, registered_at FROM users")
      .all();
  }

  function listRecent(limit) {
    return sqliteDb
      .prepare(
        `SELECT name, email, registered_at
         FROM users
         ORDER BY registered_at DESC
         LIMIT ?`
      )
      .all(limit);
  }

  return {
    createUser,
    findByEmail,
    listAll,
    listRecent
  };
}

module.exports = { createSqliteUserRepository };
