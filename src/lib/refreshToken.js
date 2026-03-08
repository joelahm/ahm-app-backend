const crypto = require('crypto');

function generateSessionId() {
  return crypto.randomUUID();
}

function generateTokenFamily() {
  return crypto.randomUUID();
}

function hashRefreshToken(rawRefreshToken) {
  return crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
}

module.exports = {
  generateSessionId,
  generateTokenFamily,
  hashRefreshToken
};
