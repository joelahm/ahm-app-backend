const crypto = require('crypto');

function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  generateInviteToken,
  hashInviteToken
};
