const express = require('express');
const db = require('../db');
const config = require('../config');
const { getStripe } = require('../lib/stripe');

const router = express.Router();

// Mounted with express.raw() in index.js (before the global JSON body
// parser) because Stripe signature verification needs the exact raw bytes.
router.post('/', (req, res) => {
  const stripe = getStripe();
  if (!stripe || !config.stripeWebhookSecret) {
    return res.status(503).send('Stripe is not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook signature verification failed`);
  }

  const intent = event.data.object;

  if (event.type === 'payment_intent.succeeded') {
    const result = db.prepare(
      `UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL, updated_at = datetime('now')
       WHERE stripe_payment_intent_id = ? AND status = 'pending_payment'`
    ).run(intent.id);
    if (result.changes === 0) {
      console.warn(`Webhook: no pending booking found for succeeded payment_intent ${intent.id}`);
    }
  } else if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    db.prepare(
      `UPDATE bookings SET status = 'cancelled', updated_at = datetime('now')
       WHERE stripe_payment_intent_id = ? AND status = 'pending_payment'`
    ).run(intent.id);
  }

  res.json({ received: true });
});

module.exports = router;
