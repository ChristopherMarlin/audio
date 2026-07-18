/** Nights between two 'YYYY-MM-DD' strings (end is the exclusive return date). */
function nightsBetween(start, end) {
  const ms = new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z');
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

module.exports = { nightsBetween };
