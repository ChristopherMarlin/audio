const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { isRangeAvailable, expirePendingHolds } = require('../lib/availability');
const { isValidDateStr, cleanString } = require('../lib/validate');

const router = express.Router();
router.use(requireAdmin);

// ---------------------------------------------------------------- Bookings
router.get('/bookings', (req, res) => {
  expirePendingHolds();
  const { status, car_id } = req.query;

  let sql = `SELECT b.*, c.name AS car_name, c.slug AS car_slug
             FROM bookings b JOIN cars c ON c.id = b.car_id WHERE 1=1`;
  const params = {};
  if (status) { sql += ' AND b.status = @status'; params.status = status; }
  if (car_id) { sql += ' AND b.car_id = @car_id'; params.car_id = car_id; }
  sql += ' ORDER BY b.start_date DESC, b.id DESC';

  res.json(db.prepare(sql).all(params));
});

router.get('/bookings/:id', (req, res) => {
  const booking = db.prepare(
    `SELECT b.*, c.name AS car_name, c.slug AS car_slug FROM bookings b JOIN cars c ON c.id = b.car_id WHERE b.id = ?`
  ).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

const ALLOWED_STATUSES = ['pending_payment', 'confirmed', 'cancelled', 'completed'];

router.patch('/bookings/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const body = req.body || {};
  const next = {
    status: ALLOWED_STATUSES.includes(body.status) ? body.status : existing.status,
    start_date: isValidDateStr(body.start_date) ? body.start_date : existing.start_date,
    end_date: isValidDateStr(body.end_date) ? body.end_date : existing.end_date,
    notes: body.notes !== undefined ? cleanString(body.notes, 500) : existing.notes
  };

  if (next.end_date <= next.start_date) {
    return res.status(400).json({ error: 'Return date must be after the pickup date.' });
  }

  // If the booking stays "active" (holds a date range) and the dates changed,
  // or it's being moved into an active status, re-check for conflicts first.
  const willBeActive = next.status === 'pending_payment' || next.status === 'confirmed';
  const datesChanged = next.start_date !== existing.start_date || next.end_date !== existing.end_date;
  if (willBeActive && (datesChanged || existing.status !== next.status)) {
    if (!isRangeAvailable(existing.car_id, next.start_date, next.end_date, id)) {
      return res.status(409).json({ error: 'Those dates conflict with another booking or a blocked period for this car.' });
    }
  }

  db.prepare(
    `UPDATE bookings SET status = @status, start_date = @start_date, end_date = @end_date,
       notes = @notes, hold_expires_at = NULL, updated_at = datetime('now') WHERE id = @id`
  ).run({ ...next, id });

  res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id));
});

router.delete('/bookings/:id', (req, res) => {
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });
  res.json({ ok: true });
});

// ------------------------------------------------------------- Blocked dates
router.get('/blocks', (req, res) => {
  const { car_id } = req.query;
  const sql = car_id
    ? 'SELECT * FROM blocked_dates WHERE car_id = ? ORDER BY start_date'
    : 'SELECT * FROM blocked_dates ORDER BY start_date';
  res.json(car_id ? db.prepare(sql).all(car_id) : db.prepare(sql).all());
});

router.post('/blocks', (req, res) => {
  const { car_id, start_date, end_date } = req.body || {};
  const reason = cleanString(req.body?.reason || 'maintenance', 200);

  if (!Number.isInteger(car_id) || !isValidDateStr(start_date) || !isValidDateStr(end_date) || end_date <= start_date) {
    return res.status(400).json({ error: 'Valid car_id, start_date and end_date are required.' });
  }
  const car = db.prepare('SELECT id FROM cars WHERE id = ?').get(car_id);
  if (!car) return res.status(404).json({ error: 'Car not found' });

  if (!isRangeAvailable(car_id, start_date, end_date)) {
    return res.status(409).json({ error: 'Those dates overlap an existing booking or block for this car.' });
  }

  const info = db.prepare(
    'INSERT INTO blocked_dates (car_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)'
  ).run(car_id, start_date, end_date, reason);

  res.status(201).json(db.prepare('SELECT * FROM blocked_dates WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/blocks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM blocked_dates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Block not found' });
  res.json({ ok: true });
});

// -------------------------------------------------------------------- Cars
router.get('/cars', (req, res) => {
  res.json(db.prepare('SELECT * FROM cars ORDER BY id').all());
});

router.post('/cars', (req, res) => {
  const b = req.body || {};
  const slug = cleanString(b.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = cleanString(b.name, 80);
  const category = cleanString(b.category, 40);
  const transmission = cleanString(b.transmission, 30);
  const description = cleanString(b.description || '', 500);
  const image = cleanString(b.image || '/images/car-placeholder.svg', 300);
  const seats = parseInt(b.seats, 10);
  const price_per_day_cents = parseInt(b.price_per_day_cents, 10);

  if (!slug || !name || !category || !transmission || !Number.isInteger(seats) || seats < 1 ||
      !Number.isInteger(price_per_day_cents) || price_per_day_cents < 0) {
    return res.status(400).json({ error: 'Missing or invalid car fields.' });
  }

  try {
    const info = db.prepare(
      `INSERT INTO cars (slug, name, category, seats, transmission, price_per_day_cents, image, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(slug, name, category, seats, transmission, price_per_day_cents, image, description);
    res.status(201).json(db.prepare('SELECT * FROM cars WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A car with that slug already exists.' });
    }
    throw err;
  }
});

router.put('/cars/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM cars WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Car not found' });

  const b = req.body || {};
  const next = {
    name: b.name !== undefined ? cleanString(b.name, 80) : existing.name,
    category: b.category !== undefined ? cleanString(b.category, 40) : existing.category,
    transmission: b.transmission !== undefined ? cleanString(b.transmission, 30) : existing.transmission,
    description: b.description !== undefined ? cleanString(b.description, 500) : existing.description,
    image: b.image !== undefined ? cleanString(b.image, 300) : existing.image,
    seats: b.seats !== undefined ? parseInt(b.seats, 10) : existing.seats,
    price_per_day_cents: b.price_per_day_cents !== undefined ? parseInt(b.price_per_day_cents, 10) : existing.price_per_day_cents,
    active: b.active !== undefined ? (b.active ? 1 : 0) : existing.active
  };

  if (!Number.isInteger(next.seats) || next.seats < 1 || !Number.isInteger(next.price_per_day_cents) || next.price_per_day_cents < 0) {
    return res.status(400).json({ error: 'Invalid seats or price.' });
  }

  db.prepare(
    `UPDATE cars SET name=@name, category=@category, transmission=@transmission, description=@description,
       image=@image, seats=@seats, price_per_day_cents=@price_per_day_cents, active=@active WHERE id=@id`
  ).run({ ...next, id });

  res.json(db.prepare('SELECT * FROM cars WHERE id = ?').get(id));
});

// ------------------------------------------------------------------- Stats
router.get('/stats', (req, res) => {
  expirePendingHolds();
  const totals = db.prepare(
    `SELECT status, COUNT(*) AS count FROM bookings GROUP BY status`
  ).all();
  const revenue = db.prepare(
    `SELECT COALESCE(SUM(total_price_cents), 0) AS cents FROM bookings WHERE status IN ('confirmed', 'completed')`
  ).get();
  const upcoming = db.prepare(
    `SELECT b.id, b.start_date, b.end_date, b.customer_name, c.name AS car_name
     FROM bookings b JOIN cars c ON c.id = b.car_id
     WHERE b.status = 'confirmed' AND b.start_date >= date('now')
     ORDER BY b.start_date ASC LIMIT 10`
  ).all();

  res.json({ totals, revenue_cents: revenue.cents, upcoming_pickups: upcoming });
});

module.exports = router;
