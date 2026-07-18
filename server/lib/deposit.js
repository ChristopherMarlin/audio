const crypto = require('crypto');

// none -> requested -> authorized -> captured | released
// requested/authorized can also fall to failed (card declined) or expired
// (Stripe auto-released the hold because it was never resolved in time).
const DEPOSIT_STATUSES = ['none', 'requested', 'authorized', 'captured', 'released', 'failed', 'expired'];

function generateDepositToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { DEPOSIT_STATUSES, generateDepositToken };
