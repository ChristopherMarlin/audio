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
- **Production**: in the Stripe Dashboard, add a webhook endpoint pointing at `https://yourdomain.com/api/stripe/webhook`, subscribed to `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, and `payment_intent.amount_capturable_updated` (the last one is only needed for security deposit holds, see below). Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Without Stripe keys configured, the booking form will clearly tell customers online payment isn't set up yet rather than silently failing or double-charging — the site remains fully usable for everything except taking payment.

## Security deposits

Each car can have a refundable security deposit amount (set per-car in the dashboard's Fleet tab). Unlike the rental payment, a deposit is **not** collected at booking time — it's requested closer to pickup, via a separate flow:

1. On a confirmed booking, the dashboard's **Deposit** action creates a Stripe PaymentIntent with `capture_method: 'manual'` (an authorization hold, not a charge) and gives you a one-time link to send the customer.
2. The customer opens the link (`/deposit.html?token=...`) and enters their card themselves — this places the hold without charging them.
3. At car return: **Release** the hold if the car is fine (customer is never charged), or **Capture** some or all of it if there's damage.
4. If nobody resolves it in time, Stripe releases the hold automatically and the dashboard reflects that (`expired`).

**Why not at booking time?** Card authorization holds only last 7 days by default (up to 30 days for vehicle rentals specifically, if you request `extended_authorization` — already wired up in `server/routes/admin.js`, though it's an IC+ pricing feature you may need to ask Stripe support to enable). A hold placed when someone books weeks or months in advance would expire long before they actually pick up the car, so it has to be requested near pickup instead.

**Rentals longer than 28 nights** (`config.depositHoldMaxNights` in `server/config.js`) can't be covered by any hold at all — even the extended 30-day window would expire before the customer returns the car. For these, requesting a deposit charges it immediately instead of placing a hold (`capture_method: 'automatic'` rather than `'manual'`), and the dashboard's refund action supports partial refunds so you can return most of it while keeping some back for damage. The customer-facing page (`/deposit.html`) shows accurate "charged now" vs. "held, not charged" copy depending on which mode applies. Both dashboard and customer copy read the 28-night threshold from `GET /api/config`, so it stays in sync with the server if you ever change it.

This required a second, separate PaymentIntent from the rental charge — deposit and rental webhook events are told apart via `metadata.kind` (`'rental'` vs `'deposit'`) in `server/routes/stripeWebhook.js`.

## Customizing content

Everything shipped is real, working code with **placeholder business content** you should replace:

- **Fleet, prices, descriptions, deposit amounts, photos** — easiest via the admin dashboard's Fleet tab once running, or edit `server/scripts/seed.js` before the first `npm run seed`. Car photos are simple illustrated SVGs at `public/images/car-*.svg` — swap in real photos (any format) and update the `image` field.
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
