/** yyyy-mm-dd for "N days from now", suitable for <input type="date">. */
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { dateOffset };
