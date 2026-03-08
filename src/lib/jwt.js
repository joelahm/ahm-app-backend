const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function signAccessToken({ user, env, sessionId }) {
  const issuedAt = nowEpoch();
  const expiresAt = issuedAt + env.jwt.accessTokenTtlSeconds;

  const payload = {
    sub: String(user.id),
    email: user.email,
    role: user.role,
    sid: sessionId,
    typ: 'access'
  };

  const token = jwt.sign(payload, env.jwt.accessTokenSecret, {
    algorithm: 'HS256',
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    expiresIn: env.jwt.accessTokenTtlSeconds
  });

  return { token, issuedAt, expiresAt };
}

function signRefreshToken({ userId, env, sessionId, tokenFamily }) {
  const issuedAt = nowEpoch();
  const expiresAt = issuedAt + env.jwt.refreshTokenTtlSeconds;
  const jti = crypto.randomUUID();

  const payload = {
    sub: String(userId),
    sid: sessionId,
    fam: tokenFamily,
    jti,
    typ: 'refresh'
  };

  const token = jwt.sign(payload, env.jwt.refreshTokenSecret, {
    algorithm: 'HS256',
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    expiresIn: env.jwt.refreshTokenTtlSeconds
  });

  return { token, jti, issuedAt, expiresAt, tokenFamily };
}

function verifyAccessToken(token, env) {
  return jwt.verify(token, env.jwt.accessTokenSecret, {
    algorithms: ['HS256'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience
  });
}

function verifyRefreshToken(token, env) {
  return jwt.verify(token, env.jwt.refreshTokenSecret, {
    algorithms: ['HS256'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience
  });
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
