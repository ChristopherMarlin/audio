# Marlin Rentals

A full-stack car rental platform for a Curaçao-based rental company:

- **Public site** (`/`) — marketing pages, fleet listing, and an online booking flow with real Stripe payment.
- **Admin dashboard** (`/dashboard/`) — single-login staff area to manage bookings, the fleet, and manually block dates (maintenance, personal use, etc.).
- **Mobile web app / PWA** (`/mobile/`) — installable, mobile-first "check availability" tool that deep-links into the booking flow.

All three share one Node.js/Express backend and one SQLite database, so availability is always consistent everywhere — a date booked on the public site instantly disappears from the mobile app and the dashboard calendar.

## Why bookings can't double up

Every booking request is checked and inserted inside a single **synchronous SQLite transaction** (`server/lib/availability.js`, `server/routes/bookings.js`). Because `better-sqlite3` executes transactions synchronously with no `await` inside them, there is no window where two concurrent requests can both see a date range as "free" — one wins, the other gets an immediate "those dates were just booked" response. This was load-tested with concurrent requests during development and holds up correctly.

A booking claims its dates the instant it's created (status `pending_payment`), before payment even completes, so nobody else can grab the same dates while a customer is entering their card. If payment fails, is abandoned, or takes longer than 15 minutes, the hold is released automatically (a background job also runs every minute as a safety net).

## Project layout

```
server/            Express API, SQLite access, Stripe integration, admin auth
public/             Public marketing + booking website (served at /)
dashboard/          Admin dashboard (served at /dashboard/)
mobile/             Mobile PWA (served at /mobile/)
data/               SQLite database file lives here (gitignored)
```

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure environment**
   ```
   cp .env.example .env
   ```
   Then edit `.env`:
   - `SESSION_SECRET` — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — from https://dashboard.stripe.com/apikeys (use test keys until you're ready to go live)
   - `STRIPE_WEBHOOK_SECRET` — see "Stripe webhook" below
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — your staff login (password must be strong; this is only read once, by the command below)
   - `PUBLIC_BASE_URL` — the real URL you'll deploy to

3. **Seed the fleet and create the admin account**
   ```
   npm run seed
   npm run create-admin
   ```
   `npm run seed` is safe to re-run (it won't duplicate cars). `npm run create-admin` can be re-run any time to reset the admin password.

4. **Run it**
   ```
   npm start
   ```
   Visit `http://localhost:3000/` for the public site, `http://localhost:3000/dashboard/` for the admin dashboard, and `http://localhost:3000/mobile/` for the mobile app.

   For local development with auto-restart on file changes: `npm run dev`.

### Stripe webhook (required for bookings to auto-confirm)

Stripe confirms payment asynchronously via a webhook, which is what flips a booking from `pending_payment` to `confirmed`.

- **Local testing**: install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then run:
  ```
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```
  It will print a `whsec_...` value — put that in `STRIPE_WEBHOOK_SECRET`.
- **Production**: in the Stripe Dashboard, add a webhook endpoint pointing at `https://yourdomain.com/api/stripe/webhook`, subscribed to `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Without Stripe keys configured, the booking form will clearly tell customers online payment isn't set up yet rather than silently failing or double-charging — the site remains fully usable for everything except taking payment.

## Customizing content

Everything shipped is real, working code with **placeholder business content** you should replace:

- **Fleet, prices, descriptions, photos** — easiest via the admin dashboard's Fleet tab once running, or edit `server/scripts/seed.js` before the first `npm run seed`. Car photos are simple illustrated SVGs at `public/images/car-*.svg` — swap in real photos (any format) and update the `image` field.
- **Contact info, address, hero text, colors** — `public/contact.html`, `public/index.html`, and the footer blocks across all public pages. Brand colors live as CSS variables at the top of `public/css/style.css`.
- **Airport drop-off fee** — `server/config.js` (`airportFeeCents`), currently a $15 placeholder.
- **Logo** — `public/images/logo.svg`.

## Security notes

- Passwords hashed with bcrypt (cost factor 12); login is rate-limited and timing-safe against username enumeration.
- Sessions are stored server-side in SQLite (not signed-cookie-only), survive restarts, and are `httpOnly` + `Secure` (in production) + `SameSite=Lax` — the latter also blocks the cross-site POST requests that CSRF attacks rely on for session-cookie-authenticated requests.
- Strict Content-Security-Policy via Helmet — no inline scripts anywhere in the codebase, only `'self'` and Stripe's own script are allowed to execute.
- All database queries are parameterized (no string-built SQL); all free-text user input is HTML-escaped before storage or escaped at render time.
- Rate limiting on login, booking creation, and the API as a whole.
- `npm audit` reports 0 vulnerabilities as of this build.

## Deployment

This is a standard Node.js app — deploy it to any host that runs a persistent Node process (Render, Railway, Fly.io, a VPS with PM2, etc.). It is **not** a static site and won't work on GitHub Pages/Netlify-style static hosting, since it needs a real server for the database, sessions, and Stripe webhook.

Set `NODE_ENV=production` and make sure the platform terminates TLS (HTTPS) in front of it — `app.set('trust proxy', 1)` is already configured for this. Set all the `.env` values as real environment variables on the host instead of shipping a `.env` file.

## Known limitations / scaling notes

Built for a small fleet (a handful of cars) and a single admin — genuinely bulletproof at that scale. If the business grows:

- SQLite + a single Node process is intentionally simple and sufficient for one instance; if you ever need multiple server instances behind a load balancer, move to Postgres and a shared session store.
- Only one admin role exists today (see `users` table) — multi-staff roles/permissions would need a `role`-aware auth check added to `server/middleware/auth.js`.
- Deactivating a car (Fleet tab) hides it from new bookings but does not touch its existing bookings — cancel or reassign those manually first if retiring a car with future reservations.
