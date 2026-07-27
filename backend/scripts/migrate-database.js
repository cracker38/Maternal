/**
 * Applies the versioned SQL migration file to an existing RMDP database.
 * The baseline schema and seed data are imported separately during first install.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const migrationFile = path.resolve(__dirname, '../../database/migrations_rules.sql');
const mysqlBin = process.env.MYSQL_BIN || 'C:\\xampp\\mysql\\bin\\mysql.exe';
const database = process.env.DB_NAME || 'rmdp';

if (!fs.existsSync(migrationFile)) {
  console.error(`Migration file not found: ${migrationFile}`);
  process.exit(1);
}

const args = [
  '-h', process.env.DB_HOST || 'localhost',
  '-P', String(process.env.DB_PORT || 3306),
  '-u', process.env.DB_USER || 'root',
  database,
];

const child = spawn(mysqlBin, args, {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: {
    ...process.env,
    ...(process.env.DB_PASSWORD ? { MYSQL_PWD: process.env.DB_PASSWORD } : {}),
  },
});

child.on('error', (error) => {
  console.error(`Unable to start MySQL client (${mysqlBin}): ${error.message}`);
  process.exit(1);
});

fs.createReadStream(migrationFile).pipe(child.stdin);
child.on('exit', (code) => process.exit(code || 0));
