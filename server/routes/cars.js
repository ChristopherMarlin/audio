const express = require('express');
const db = require('../db');
const { getOccupiedRanges } = require('../lib/availability');
const { isValidDateStr, todayStr } = require('../lib/validate');

const router = express.Router();

router.get('/', (req, res) => {
  const cars = db.prepare('SELECT * FROM cars WHERE active = 1 ORDER BY price_per_day_cents ASC').all();
  res.json(cars);
});

router.get('/:slug', (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE slug = ? AND active = 1').get(req.params.slug);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(car);
});

// Occupied date ranges for a car, e.g. ?from=2026-07-01&to=2026-09-01
router.get('/:slug/availability', (req, res) => {
  const car = db.prepare('SELECT id FROM cars WHERE slug = ? AND active = 1').get(req.params.slug);
  if (!car) return res.status(404).json({ error: 'Car not found' });

  const from = isValidDateStr(req.query.from) ? req.query.from : todayStr();
  const to = isValidDateStr(req.query.to)
    ? req.query.to
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (from >= to) return res.status(400).json({ error: 'Invalid date range' });

  const ranges = getOccupiedRanges(car.id, from, to).map((r) => ({ start: r.start_date, end: r.end_date }));
  res.json({ from, to, unavailable: ranges });
});

module.exports = router;
