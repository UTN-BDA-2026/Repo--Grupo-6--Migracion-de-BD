function createSqliteUserRepository(sqliteDb) {
  if (!sqliteDb) {
    throw new Error("sqliteDb is required");
  }

  function createUser({ name, email, passwordHash, registeredAt, balance = 100, version = 1 }) {
    const stmt = sqliteDb.prepare(`
      INSERT INTO users (name, email, password_hash, registered_at, balance, version)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(name, email, passwordHash, registeredAt, balance, version);
  }

  function findByEmail(email) {
    return sqliteDb
      .prepare("SELECT id, name, email, password_hash, registered_at, balance, version FROM users WHERE email = ?")
      .get(email);
  }

  function listAll() {
    return sqliteDb
      .prepare("SELECT name, email, password_hash, registered_at, balance, version FROM users")
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
