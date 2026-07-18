const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'marlin.db'));

// WAL mode gives us safe concurrent reads while writes are serialized -
// combined with better-sqlite3 being fully synchronous, the
// check-availability-then-insert-booking logic in routes/bookings.js is
// atomic with respect to other requests (no async gap where a race can sneak in).
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    seats INTEGER NOT NULL,
    transmission TEXT NOT NULL,
    price_per_day_cents INTEGER NOT NULL,
    deposit_cents INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id),
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending_payment','confirmed','cancelled','completed')),
    total_price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    airport_dropoff INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    stripe_payment_intent_id TEXT,
    hold_expires_at TEXT,
    deposit_amount_cents INTEGER NOT NULL DEFAULT 0,
    deposit_status TEXT NOT NULL DEFAULT 'none',
    deposit_payment_intent_id TEXT,
    deposit_captured_cents INTEGER NOT NULL DEFAULT 0,
    deposit_capture_before TEXT,
    deposit_token TEXT,
    deposit_capture_method TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'maintenance',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_car_status ON bookings(car_id, status);
  CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(car_id, start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_blocked_car ON blocked_dates(car_id, start_date, end_date);
`);

// Migration for databases created before deposit support was added - CREATE
// TABLE IF NOT EXISTS above only applies to brand new databases, so existing
// ones need these columns added explicitly. Safe to run every startup.
function addColumnIfMissing(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('cars', 'deposit_cents', "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing('bookings', 'deposit_amount_cents', "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing('bookings', 'deposit_status', "TEXT NOT NULL DEFAULT 'none'");
addColumnIfMissing('bookings', 'deposit_payment_intent_id', "TEXT");
addColumnIfMissing('bookings', 'deposit_captured_cents', "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing('bookings', 'deposit_capture_method', "TEXT NOT NULL DEFAULT 'manual'");
addColumnIfMissing('bookings', 'deposit_capture_before', "TEXT");
addColumnIfMissing('bookings', 'deposit_token', "TEXT");

db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_deposit_token ON bookings(deposit_token);`);

module.exports = db;
