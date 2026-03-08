const bcrypt = require('bcryptjs');

const PASSWORD_HASH_ROUNDS = Number(process.env.PASSWORD_HASH_ROUNDS || 12);

function hashPassword(plainTextPassword) {
  return bcrypt.hash(plainTextPassword, PASSWORD_HASH_ROUNDS);
}

function verifyPassword(plainTextPassword, passwordHash) {
  return bcrypt.compare(plainTextPassword, passwordHash);
}

module.exports = {
  PASSWORD_HASH_ROUNDS,
  hashPassword,
  verifyPassword
};
