const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const sqlitePath = process.env.SQLITE_DB_PATH || "./data/local.sqlite";
const resolvedPath = path.resolve(sqlitePath);

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirectoryExists(resolvedPath);
const sqliteDb = new DatabaseSync(resolvedPath);

function initSqlite() {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      registered_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_registered_at
      ON users (registered_at);

    CREATE INDEX IF NOT EXISTS idx_users_name
      ON users (name);
  `);
}

module.exports = {
  initSqlite,
  sqliteDb
};
