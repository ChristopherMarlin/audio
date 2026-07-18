require('dotenv').config();

function required(name, fallbackForDev) {
  const val = process.env[name];
  if (val) return val;
  if (process.env.NODE_ENV !== 'production') return fallbackForDev;
  throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: required('SESSION_SECRET', 'dev-only-insecure-secret-do-not-use-in-production'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  currency: (process.env.CURRENCY || 'usd').toLowerCase(),
  // Minutes a "pending_payment" booking holds its dates before being released automatically.
  holdMinutes: 15,
  // Flat placeholder fee for airport drop-off/pickup - adjust from the admin dashboard's config or here.
  airportFeeCents: 1500,
  maxRentalDays: 60
};
