// Creates or updates the admin user from ADMIN_USERNAME / ADMIN_PASSWORD in .env.
// Re-run any time to reset the password. Idempotent upsert on username.
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../db');

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD in your .env file first.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters. Choose a stronger password and try again.');
    process.exit(1);
  }
  if (password === 'change-this-immediately') {
    console.error('You must change ADMIN_PASSWORD from the placeholder value in .env before creating the admin account.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
    console.log(`Updated password for existing admin user "${username}".`);
  } else {
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin');
    console.log(`Created admin user "${username}".`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
