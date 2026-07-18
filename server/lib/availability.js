const db = require('../db');
const config = require('../config');

// Dates are plain 'YYYY-MM-DD' strings throughout - ISO date strings sort and
// compare correctly with plain string/lexicographic comparisons, so no date
// parsing is needed for overlap checks. Convention: start_date is the pickup
// day (inclusive), end_date is the return day (exclusive) - a booking from
// 2026-01-10 to 2026-01-12 occupies the car on the 10th and 11th, and it's
// back in the fleet again on the 12th.

/** Two [start, end) ranges overlap iff aStart < bEnd && aEnd > bStart. */
const OVERLAP_SQL = 'start_date < @end_date AND end_date > @start_date';

/**
 * Expire stale payment holds so their dates become available again.
 * Must run before any availability check / booking insert so we never
 * treat an abandoned checkout as still holding the calendar.
 */
function expirePendingHolds() {
  db.prepare(
    `UPDATE bookings
     SET status = 'cancelled', updated_at = datetime('now')
     WHERE status = 'pending_payment' AND hold_expires_at IS NOT NULL AND hold_expires_at < datetime('now')`
  ).run();
}

/**
 * Returns true if [start_date, end_date) is free for this car - i.e. no
 * active booking (confirmed or a still-live payment hold) and no manual
 * maintenance block overlaps it. excludeBookingId lets an admin edit a
 * booking without it colliding with itself.
 */
function isRangeAvailable(carId, start_date, end_date, excludeBookingId) {
  expirePendingHolds();

  const bookingConflict = db.prepare(
    `SELECT id FROM bookings
     WHERE car_id = @car_id
       AND status IN ('pending_payment', 'confirmed')
       AND (${OVERLAP_SQL})
       AND (@exclude_id IS NULL OR id != @exclude_id)
     LIMIT 1`
  ).get({ car_id: carId, start_date, end_date, exclude_id: excludeBookingId || null });

  if (bookingConflict) return false;

  const blockConflict = db.prepare(
    `SELECT id FROM blocked_dates WHERE car_id = @car_id AND (${OVERLAP_SQL}) LIMIT 1`
  ).get({ car_id: carId, start_date, end_date });

  return !blockConflict;
}

/** All occupied ranges for a car (for rendering a calendar), optionally within a window. */
function getOccupiedRanges(carId, fromDate, toDate) {
  expirePendingHolds();

  const bookings = db.prepare(
    `SELECT start_date, end_date, status FROM bookings
     WHERE car_id = ? AND status IN ('pending_payment', 'confirmed')
       AND end_date > ? AND start_date < ?
     ORDER BY start_date`
  ).all(carId, fromDate, toDate);

  const blocks = db.prepare(
    `SELECT start_date, end_date, 'blocked' AS status FROM blocked_dates
     WHERE car_id = ? AND end_date > ? AND start_date < ?
     ORDER BY start_date`
  ).all(carId, fromDate, toDate);

  return [...bookings, ...blocks].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

function holdExpiryTimestamp() {
  return new Date(Date.now() + config.holdMinutes * 60 * 1000).toISOString();
}

module.exports = { expirePendingHolds, isRangeAvailable, getOccupiedRanges, holdExpiryTimestamp };
