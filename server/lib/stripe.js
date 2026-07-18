const config = require('../config');

// Stripe is optional at boot (so the site still runs before keys are configured),
// but any route that actually needs it will get a clear 503 instead of a crash.
let stripeClient = null;
if (config.stripeSecretKey) {
  const Stripe = require('stripe');
  stripeClient = new Stripe(config.stripeSecretKey);
}

function getStripe() {
  return stripeClient;
}

module.exports = { getStripe };
