/**
 * Dual-database shim.
 * MySQL  → clinical tables (mothers, pregnancies, ANC, labor, deliveries, emergencies …)
 * SQLite → operational tables (audit_logs, alerts, followup_tasks)
 *
 * All existing routes use `require('../db')` unchanged.
 */
module.exports = require('./db/index');
