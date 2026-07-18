const { expirePendingHolds } = require('../lib/availability');

/** Periodically release abandoned payment holds even with no incoming traffic. */
function startExpiryJob() {
  const interval = setInterval(() => {
    try {
      expirePendingHolds();
    } catch (err) {
      console.error('Failed to expire pending holds:', err);
    }
  }, 60 * 1000);
  interval.unref();
  return interval;
}

module.exports = { startExpiryJob };
