/**
 * Single-database router — all tables use SQLite (Render deployment).
 * Exposes execute, query, getConnection matching mysql2/promise API shape.
 */
const sqlite = require('./sqlite');

module.exports = {
  execute: sqlite.execute,
  query: sqlite.query,
  getConnection: sqlite.getConnection,
  mysql: sqlite,   // back-compat for any code that does pool.mysql.*
  sqlite,
};
