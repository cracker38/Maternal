/**
 * Dual-database router
 *
 * SQLite  → audit_logs, alerts
 *           (standalone tables, no cross-DB JOINs, write-heavy)
 *
 * MySQL   → all clinical tables
 *           (mothers, pregnancies, anc_visits, labor, deliveries,
 *            emergencies, followup_tasks, referrals, facilities, users …)
 *
 * Both adapters expose:
 *   execute(sql, params) → Promise<[rows|meta]>
 *
 * Drop-in replacement for the old `require('../db')` pool.
 */
const mysql = require('./mysql');
const sqlite = require('./sqlite');

// Tables that live in SQLite — no JOINs to MySQL tables in any route
const SQLITE_TABLES = new Set(['audit_logs', 'alerts']);

function _routeToSqlite(sql) {
  const s = sql.replace(/\s+/g, ' ').toLowerCase();
  for (const t of SQLITE_TABLES) {
    if (s.includes(t)) return true;
  }
  return false;
}

async function execute(sql, params) {
  if (_routeToSqlite(sql)) return sqlite.execute(sql, params);
  return mysql.execute(sql, params);
}

// Pass-through for code that uses pool.query() or pool.getConnection()
function query(...args) { return mysql.query(...args); }
function getConnection(...args) { return mysql.getConnection(...args); }

module.exports = { execute, query, getConnection, mysql, sqlite };
