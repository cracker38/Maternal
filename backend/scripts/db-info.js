/**
 * npm run db:info
 * Shows table counts for both MySQL and SQLite databases.
 */
require('dotenv').config();
const mysql = require('../src/db/mysql');
const sqlite = require('../src/db/sqlite');

async function main() {
  console.log('\n=== RMDP Dual-Database Info ===\n');

  // MySQL tables
  console.log('MySQL (clinical data) — rmdp database:');
  const mysqlTables = [
    'facilities', 'users', 'mothers', 'pregnancies',
    'anc_visits', 'anc_vitals', 'anc_labs', 'danger_signs', 'treatments',
    'labor_admissions', 'partograph_entries',
    'emergencies', 'emergency_actions',
    'deliveries', 'newborns',
    'postpartum_assessments', 'followup_tasks',
    'referrals', 'clinical_corrections',
  ];
  for (const t of mysqlTables) {
    try {
      const [rows] = await mysql.execute(`SELECT COUNT(*) AS n FROM ${t}`);
      console.log(`  ${t.padEnd(28)} ${rows[0].n} rows`);
    } catch (e) {
      console.log(`  ${t.padEnd(28)} (missing: ${e.message})`);
    }
  }

  // SQLite tables
  console.log('\nSQLite (operational data) — rmdp_local.sqlite:');
  const sqliteTables = ['audit_logs', 'alerts'];
  for (const t of sqliteTables) {
    try {
      const [rows] = await sqlite.execute(`SELECT COUNT(*) AS n FROM ${t}`);
      console.log(`  ${t.padEnd(28)} ${rows[0].n} rows`);
    } catch (e) {
      console.log(`  ${t.padEnd(28)} (missing: ${e.message})`);
    }
  }

  console.log('\nDone.\n');
  setTimeout(() => process.exit(0), 200);
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(1), 200); });
