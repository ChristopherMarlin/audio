const validator = require('validator');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today as a 'YYYY-MM-DD' string in UTC - used to reject bookings in the past. */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isValidEmail(s) {
  return typeof s === 'string' && s.length <= 254 && validator.isEmail(s);
}

/** Loose phone check: digits, spaces, +, -, (, ) only, 6-20 chars. Good enough without over-rejecting real numbers. */
function isValidPhone(s) {
  return typeof s === 'string' && /^[0-9+\-()\s]{6,20}$/.test(s);
}

function cleanString(s, maxLen) {
  if (typeof s !== 'string') return '';
  return validator.escape(s.trim()).slice(0, maxLen);
}

module.exports = { isValidDateStr, todayStr, isValidEmail, isValidPhone, cleanString };
