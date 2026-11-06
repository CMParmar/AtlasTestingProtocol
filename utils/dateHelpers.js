/** yyyy-mm-dd for "N days from now", suitable for <input type="date">. */
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "08 Nov 2026" -- how the Tasks list shows a due date. */
function formatListDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "11/05/2026, 10:00 AM" -- how the Reminder field shows yyyy-mm-dd + 24h time. */
function formatReminderDisplay(iso, time24) {
  const [y, m, d] = iso.split('-');
  const [hh, mm] = time24.split(':').map(Number);
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${m}/${d}/${y}, ${hour12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

module.exports = { dateOffset, formatListDate, formatReminderDisplay };
