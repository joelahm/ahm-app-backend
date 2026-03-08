const { AppError } = require('../../lib/errors');
const { verifyPassword } = require('../../lib/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../lib/jwt');
const { generateSessionId, generateTokenFamily, hashRefreshToken } = require('../../lib/refreshToken');

function mapUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    email: user.email,
    role: user.roleCode,
    isActive: user.isActive,
    status: user.status,
    first_name: user.firstName,
    last_name: user.lastName,
    password_hash: user.passwordHash
  };
}

async function getActiveUserByEmail(db, email) {
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      roleCode: true,
      isActive: true,
      status: true
    }
  });

  return mapUser(user);
}

async function getActiveUserById(db, userId) {
  const user = await db.user.findUnique({
    where: { id: BigInt(userId) },
    select: {
      id: true,
      email: true,
      roleCode: true,
      isActive: true,
      status: true,
      firstName: true,
      lastName: true
    }
  });

  return mapUser(user);
}

async function persistRefreshToken({ db, userId, refresh, sessionId, tokenFamily, ipAddress, userAgent }) {
  const tokenHash = hashRefreshToken(refresh.token);

  await db.refreshToken.create({
    data: {
      userId: BigInt(userId),
      sessionId,
      tokenFamily,
      jti: refresh.jti,
      tokenHash,
      expiresAt: new Date(refresh.expiresAt * 1000),
      createdByIp: ipAddress || null,
      userAgent: userAgent || null,
      isRevoked: false
    }
  });
}

async function login({ db, env, email, password, ipAddress, userAgent }) {
  const user = await getActiveUserByEmail(db, email);

  if (!user || !user.password_hash) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  if (!user.isActive || user.status !== 'ACTIVE') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Account is not active.');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const sessionId = generateSessionId();
  const tokenFamily = generateTokenFamily();

  const access = signAccessToken({ user, env, sessionId });
  const refresh = signRefreshToken({ userId: user.id, env, sessionId, tokenFamily });

  await persistRefreshToken({
    db,
    userId: user.id,
    refresh,
    sessionId,
    tokenFamily,
    ipAddress,
    userAgent
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
      sessionId
    }
  };
}

async function revokeTokenFamily(db, tokenFamily, reason) {
  await db.refreshToken.updateMany({
    where: { tokenFamily, isRevoked: false },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason
    }
  });
}

async function refresh({ db, env, refreshToken, ipAddress, userAgent }) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken, env);
  } catch (err) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
  }

  const tokenRecord = await db.refreshToken.findUnique({ where: { jti: decoded.jti } });

  if (!tokenRecord) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token not recognized.');
  }

  const presentedHash = hashRefreshToken(refreshToken);

  if (tokenRecord.tokenHash !== presentedHash) {
    await revokeTokenFamily(db, tokenRecord.tokenFamily, 'TOKEN_HASH_MISMATCH_REUSE_DETECTED');
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token rejected.');
  }

  if (tokenRecord.isRevoked || tokenRecord.replacedByJti) {
    await revokeTokenFamily(db, tokenRecord.tokenFamily, 'ROTATED_TOKEN_REUSE_DETECTED');
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token already rotated or revoked.');
  }

  const user = await getActiveUserById(db, Number(tokenRecord.userId));
  if (!user || !user.isActive || user.status !== 'ACTIVE') {
    await revokeTokenFamily(db, tokenRecord.tokenFamily, 'ACCOUNT_NOT_ACTIVE');
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Account is not active.');
  }

  const access = signAccessToken({ user, env, sessionId: tokenRecord.sessionId });
  const nextRefresh = signRefreshToken({
    userId: user.id,
    env,
    sessionId: tokenRecord.sessionId,
    tokenFamily: tokenRecord.tokenFamily
  });

  await db.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'ROTATED',
        replacedByJti: nextRefresh.jti,
        lastUsedAt: new Date()
      }
    });

    await tx.refreshToken.create({
      data: {
        userId: BigInt(user.id),
        sessionId: tokenRecord.sessionId,
        tokenFamily: tokenRecord.tokenFamily,
        jti: nextRefresh.jti,
        tokenHash: hashRefreshToken(nextRefresh.token),
        expiresAt: new Date(nextRefresh.expiresAt * 1000),
        createdByIp: ipAddress || null,
        userAgent: userAgent || null,
        isRevoked: false
      }
    });
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: nextRefresh.token,
      refreshTokenExpiresAt: nextRefresh.expiresAt,
      sessionId: tokenRecord.sessionId
    }
  };
}

async function logout({ db, env, refreshToken }) {
  try {
    const decoded = verifyRefreshToken(refreshToken, env);
    await revokeTokenFamily(db, decoded.fam, 'LOGOUT');
    return;
  } catch (err) {
    return;
  }
}

module.exports = {
  login,
  refresh,
  logout,
  getActiveUserById
};
