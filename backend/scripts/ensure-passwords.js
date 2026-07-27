/**
 * Ensures all demo users have password123
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rmdp',
  });
  const hash = await bcrypt.hash('password123', 10);
  await pool.execute('UPDATE users SET password_hash = ?', [hash]);
  console.log('Updated all users to password123');
  console.log(hash);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
