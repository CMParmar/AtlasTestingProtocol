const crypto = require('crypto');

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) from a base32 secret - for the admin re-authentication step. */
function totp(secret, time = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/[\s=-]/g, '').toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error('ADMIN_TOTP_SECRET is not valid base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

module.exports = { totp };
