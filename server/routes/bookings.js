const express = require('express');
const db = require('../db');
const config = require('../config');
const { getStripe } = require('../lib/stripe');
const { isRangeAvailable, holdExpiryTimestamp, expirePendingHolds } = require('../lib/availability');
const { isValidDateStr, todayStr, isValidEmail, isValidPhone, cleanString } = require('../lib/validate');
const { nightsBetween } = require('../lib/dates');
const { bookingLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/', bookingLimiter, async (req, res) => {
  const body = req.body || {};
  const car_slug = typeof body.car_slug === 'string' ? body.car_slug : '';
  const start_date = body.start_date;
  const end_date = body.end_date;
  const customer_name = cleanString(body.customer_name, 120);
  const customer_email = typeof body.customer_email === 'string' ? body.customer_email.trim().toLowerCase() : '';
  const customer_phone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
  const airport_dropoff = body.airport_dropoff === true;
  const notes = cleanString(body.notes || '', 500);

  // --- Validation -------------------------------------------------------
  if (!customer_name) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!isValidEmail(customer_email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!isValidPhone(customer_phone)) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    return res.status(400).json({ error: 'Please choose valid pickup and return dates.' });
  }
  if (start_date < todayStr()) return res.status(400).json({ error: 'Pickup date cannot be in the past.' });
  if (end_date <= start_date) return res.status(400).json({ error: 'Return date must be after the pickup date.' });

  const nights = nightsBetween(start_date, end_date);
  if (nights > config.maxRentalDays) {
    return res.status(400).json({ error: `Bookings longer than ${config.maxRentalDays} days are not supported online - please contact us directly.` });
  }

  const car = db.prepare('SELECT * FROM cars WHERE slug = ? AND active = 1').get(car_slug);
  if (!car) return res.status(404).json({ error: 'Selected car was not found.' });

  const total_price_cents = nights * car.price_per_day_cents + (airport_dropoff ? config.airportFeeCents : 0);

  // --- Atomically claim the dates ---------------------------------------
  // Everything inside this transaction runs synchronously (better-sqlite3),
  // so there is no window for a second request to sneak in between the
  // availability check and the insert - this is what makes double-booking
  // impossible even under concurrent requests for the same car/dates.
  let bookingId;
  try {
    const claim = db.transaction(() => {
      expirePendingHolds();
      if (!isRangeAvailable(car.id, start_date, end_date)) {
        throw new Error('UNAVAILABLE');
      }
      const info = db.prepare(
        `INSERT INTO bookings
           (car_id, customer_name, customer_email, customer_phone, start_date, end_date,
            status, total_price_cents, currency, airport_dropoff, notes, hold_expires_at)
         VALUES (@car_id, @customer_name, @customer_email, @customer_phone, @start_date, @end_date,
            'pending_payment', @total_price_cents, @currency, @airport_dropoff, @notes, @hold_expires_at)`
      ).run({
        car_id: car.id,
        customer_name,
        customer_email,
        customer_phone,
        start_date,
        end_date,
        total_price_cents,
        currency: config.currency,
        airport_dropoff: airport_dropoff ? 1 : 0,
        notes,
        hold_expires_at: holdExpiryTimestamp()
      });
      return info.lastInsertRowid;
    });
    bookingId = claim();
  } catch (err) {
    if (err.message === 'UNAVAILABLE') {
      return res.status(409).json({ error: 'Sorry, those dates were just booked for this car. Please pick different dates.' });
    }
    console.error('Booking creation failed:', err);
    return res.status(500).json({ error: 'Something went wrong creating your booking. Please try again.' });
  }

  // --- Create the Stripe PaymentIntent -----------------------------------
  const stripe = getStripe();
  if (!stripe) {
    // No Stripe keys configured yet - free the hold immediately so we don't
    // block real customers with an unpayable booking, and tell the caller why.
    db.prepare("UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(bookingId);
    return res.status(503).json({ error: 'Online payment is not configured yet. Please contact us directly to book.' });
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: total_price_cents,
      currency: config.currency,
      metadata: { kind: 'rental', booking_id: String(bookingId), car_slug },
      receipt_email: customer_email,
      description: `Marlin Rentals - ${car.name} (${start_date} to ${end_date})`
    });

    db.prepare('UPDATE bookings SET stripe_payment_intent_id = ? WHERE id = ?').run(intent.id, bookingId);

    res.status(201).json({
      booking_id: bookingId,
      total_price_cents,
      currency: config.currency,
      client_secret: intent.client_secret,
      publishable_key: config.stripePublishableKey
    });
  } catch (err) {
    console.error('Stripe payment intent failed:', err);
    // Free the dates right away rather than making the customer wait for the hold to expire.
    db.prepare("UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(bookingId);
    res.status(502).json({ error: 'Could not start the payment process. Please try again in a moment.' });
  }
});

// Look up a booking's status - requires the email used at booking time so
// one customer can't page through another customer's booking IDs.
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  if (!Number.isInteger(id) || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Booking id and email are required.' });
  }

  const booking = db.prepare(
    `SELECT b.id, b.status, b.start_date, b.end_date, b.total_price_cents, b.currency, b.airport_dropoff,
            c.name AS car_name
     FROM bookings b JOIN cars c ON c.id = b.car_id
     WHERE b.id = ? AND b.customer_email = ?`
  ).get(id, email);

  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json(booking);
});

module.exports = router;
