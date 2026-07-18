const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');

const config = require('./config');
const { startExpiryJob } = require('./jobs/expirePending');
const SqliteSessionStore = require('./lib/sqliteSessionStore');

const authRoutes = require('./routes/auth');
const carRoutes = require('./routes/cars');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const depositRoutes = require('./routes/deposit');
const stripeWebhookRoutes = require('./routes/stripeWebhook');
const { generalApiLimiter } = require('./middleware/rateLimit');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // needed for secure cookies when running behind Render/Railway/Fly/etc.

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.stripe.com'],
        frameSrc: ["'self'", 'https://js.stripe.com'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    }
  })
);

// Stripe webhook needs the raw request body (as a Buffer) for signature
// verification, so it gets its own express.raw() here instead of the global
// express.json() body parser below, which would otherwise consume the body
// as parsed JSON and break constructEvent's signature check.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    name: 'marlin.sid',
    store: new SqliteSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use('/api', generalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/deposit', depositRoutes);

app.get('/api/config', (req, res) => {
  res.json({
    stripePublishableKey: config.stripePublishableKey,
    currency: config.currency,
    depositHoldMaxNights: config.depositHoldMaxNights
  });
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
app.use('/mobile', express.static(path.join(__dirname, '..', 'mobile')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

startExpiryJob();

app.listen(config.port, () => {
  console.log(`Marlin Rentals server listening on port ${config.port} (${config.nodeEnv})`);
});
