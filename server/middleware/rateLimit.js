const rateLimit = require('express-rate-limit');

// Login: slow brute force way down without locking out a real admin for long.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Booking creation: generous for real customers, but stops a script from
// spamming fake holds to lock out every date on a car.
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts from this device. Please try again later or contact us directly.' }
});

// Coarse safety net over every /api/* route, layered underneath the
// stricter per-route limiters above.
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' }
});

module.exports = { loginLimiter, bookingLimiter, generalApiLimiter };
