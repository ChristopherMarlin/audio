const express = require('express');
const db = require('../db');
const config = require('../config');
const { getStripe } = require('../lib/stripe');

const router = express.Router();

// Mounted with express.raw() in index.js (before the global JSON body
// parser) because Stripe signature verification needs the exact raw bytes.
router.post('/', async (req, res) => {
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
  const kind = intent.metadata && intent.metadata.kind;

  try {
    if (kind === 'deposit') {
      await handleDepositEvent(stripe, event.type, intent);
    } else {
      handleRentalEvent(event.type, intent);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Error handling Stripe webhook event:', err);
    // Non-2xx tells Stripe to retry delivery rather than silently losing the event.
    res.status(500).json({ error: 'Failed to process webhook event' });
  }
});

function handleRentalEvent(eventType, intent) {
  if (eventType === 'payment_intent.succeeded') {
    const result = db.prepare(
      `UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL, updated_at = datetime('now')
       WHERE stripe_payment_intent_id = ? AND status = 'pending_payment'`
    ).run(intent.id);
    if (result.changes === 0) {
      console.warn(`Webhook: no pending booking found for succeeded payment_intent ${intent.id}`);
    }
  } else if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
    db.prepare(
      `UPDATE bookings SET status = 'cancelled', updated_at = datetime('now')
       WHERE stripe_payment_intent_id = ? AND status = 'pending_payment'`
    ).run(intent.id);
  }
}

async function handleDepositEvent(stripe, eventType, intent) {
  if (eventType === 'payment_intent.amount_capturable_updated') {
    // The hold is now live on the customer's card. Fetch the charge to learn
    // capture_before - the hard deadline by which we must capture or release
    // it before the card network releases it automatically.
    let captureBefore = null;
    try {
      const full = await stripe.paymentIntents.retrieve(intent.id, { expand: ['latest_charge'] });
      captureBefore = full.latest_charge && full.latest_charge.payment_method_details &&
        full.latest_charge.payment_method_details.card &&
        full.latest_charge.payment_method_details.card.capture_before
          ? new Date(full.latest_charge.payment_method_details.card.capture_before * 1000).toISOString()
          : null;
    } catch (err) {
      console.error('Could not retrieve deposit charge for capture_before:', err);
    }

    db.prepare(
      `UPDATE bookings SET deposit_status = 'authorized', deposit_capture_before = ?, updated_at = datetime('now')
       WHERE deposit_payment_intent_id = ? AND deposit_status = 'requested'`
    ).run(captureBefore, intent.id);
  } else if (eventType === 'payment_intent.succeeded') {
    // A manual-capture PaymentIntent reaches 'succeeded' once captured (fully or partially).
    db.prepare(
      `UPDATE bookings SET deposit_status = 'captured', deposit_captured_cents = ?, updated_at = datetime('now')
       WHERE deposit_payment_intent_id = ?`
    ).run(intent.amount_received || 0, intent.id);
  } else if (eventType === 'payment_intent.canceled') {
    // Covers both an explicit release from the dashboard and Stripe
    // auto-releasing the hold because capture_before passed unattended.
    db.prepare(
      `UPDATE bookings SET deposit_status = 'released', updated_at = datetime('now')
       WHERE deposit_payment_intent_id = ? AND deposit_status IN ('requested', 'authorized')`
    ).run(intent.id);
  } else if (eventType === 'payment_intent.payment_failed') {
    db.prepare(
      `UPDATE bookings SET deposit_status = 'failed', updated_at = datetime('now')
       WHERE deposit_payment_intent_id = ? AND deposit_status = 'requested'`
    ).run(intent.id);
  }
}

module.exports = router;
