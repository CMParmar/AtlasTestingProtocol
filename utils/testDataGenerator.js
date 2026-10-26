const UNIQUE_EMAIL_DOMAIN = 'example.test';

/** Returns a unique title so parallel/repeat runs don't collide. */
function uniqueTitle(label) {
  return `${label} ${Date.now()}`;
}

/** Returns a unique, non-existent email address for negative tests. */
function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}@${UNIQUE_EMAIL_DOMAIN}`;
}

module.exports = { uniqueTitle, uniqueEmail };
