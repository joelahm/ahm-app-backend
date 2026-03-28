const { AppError } = require('../../lib/errors');
const { verifyPassword } = require('../../lib/password');
const { hashPassword } = require('../../lib/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../lib/jwt');
const { generateSessionId, generateTokenFamily, hashRefreshToken } = require('../../lib/refreshToken');
const { hashInviteToken } = require('../../lib/inviteToken');

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
    avatar_url: user.avatarUrl ?? null,
    title: user.title ?? null,
    phone_number: user.phoneNumber ?? null,
    country: user.country ?? null,
    timezone: user.timezone ?? null,
    date_format: user.dateFormat ?? null,
    created_at: user.createdAt ?? null,
    updated_at: user.updatedAt ?? null,
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
      lastName: true,
      avatarUrl: true,
      title: true,
      phoneNumber: true,
      country: true,
      timezone: true,
      dateFormat: true,
      createdAt: true,
      updatedAt: true
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

function parseLocations(locationsJson) {
  if (!locationsJson) return [];
  if (Array.isArray(locationsJson)) return locationsJson;
  if (typeof locationsJson === 'string') {
    try {
      const parsed = JSON.parse(locationsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getInvitationByTokenHash(db, tokenHash) {
  const rows = await db.$queryRaw`
    SELECT id, email, role_code, locations_json, status, expires_at
    FROM user_invitations
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;

  if (!rows.length) {
    throw new AppError(400, 'INVALID_INVITATION_TOKEN', 'Invitation token is invalid or expired.');
  }

  const invite = rows[0];
  const expiresAt = new Date(invite.expires_at);

  if (invite.status !== 'PENDING') {
    throw new AppError(400, 'INVALID_INVITATION_TOKEN', 'Invitation token is invalid or expired.');
  }

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'INVALID_INVITATION_TOKEN', 'Invitation token is invalid or expired.');
  }

  return {
    id: Number(invite.id),
    email: invite.email,
    role: invite.role_code,
    locations: parseLocations(invite.locations_json),
    expiresAt: expiresAt.toISOString()
  };
}

async function validateInvitation({ db, token }) {
  const tokenHash = hashInviteToken(token);
  const invite = await getInvitationByTokenHash(db, tokenHash);

  const existing = await db.user.findUnique({
    where: { email: invite.email },
    select: { id: true }
  });

  if (existing) {
    throw new AppError(409, 'INVITATION_ALREADY_USED', 'Invitation is no longer valid.');
  }

  return {
    invitation: {
      email: invite.email,
      role: invite.role,
      locations: invite.locations,
      expiresAt: invite.expiresAt
    }
  };
}

async function acceptInvitation({ db, env, token, firstName, lastName, password, ipAddress, userAgent }) {
  if (!firstName || !lastName || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'firstName, lastName and password are required.');
  }

  if (String(password).length < 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters.');
  }

  const tokenHash = hashInviteToken(token);
  const passwordHash = await hashPassword(password);

  let createdUser;

  await db.$transaction(async (tx) => {
    const invite = await getInvitationByTokenHash(tx, tokenHash);

    const existing = await tx.user.findUnique({
      where: { email: invite.email },
      select: { id: true }
    });

    if (existing) {
      throw new AppError(409, 'INVITATION_ALREADY_USED', 'Invitation is no longer valid.');
    }

    createdUser = await tx.user.create({
      data: {
        email: invite.email,
        passwordHash,
        roleCode: invite.role,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        status: 'ACTIVE',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        roleCode: true
      }
    });

    await tx.$executeRaw`
      INSERT INTO auth_identities
      (user_id, provider, provider_user_id, provider_email, linked_at, created_at, updated_at)
      VALUES
      (${createdUser.id}, 'credentials', ${createdUser.email}, ${createdUser.email}, NOW(), NOW(), NOW())
    `;

    const updated = await tx.$executeRaw`
      UPDATE user_invitations
      SET status = 'ACCEPTED',
          accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = ${BigInt(invite.id)}
        AND status = 'PENDING'
    `;

    if (!updated) {
      throw new AppError(409, 'INVITATION_ALREADY_USED', 'Invitation is no longer valid.');
    }
  });

  const user = {
    id: Number(createdUser.id),
    email: createdUser.email,
    role: createdUser.roleCode
  };

  const sessionId = generateSessionId();
  const tokenFamily = generateTokenFamily();
  const access = signAccessToken({ user, env, sessionId });
  const refreshToken = signRefreshToken({ userId: user.id, env, sessionId, tokenFamily });

  await persistRefreshToken({
    db,
    userId: user.id,
    refresh: refreshToken,
    sessionId,
    tokenFamily,
    ipAddress,
    userAgent
  });

  return {
    user,
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
      sessionId
    }
  };
}

async function registerInvitedUser({
  db,
  env,
  token,
  firstName,
  lastName,
  title,
  phoneNumber,
  email,
  country,
  timezone,
  dateFormat,
  password,
  confirmPassword,
  ipAddress,
  userAgent
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (
    !token
    || !firstName
    || !lastName
    || !title
    || !phoneNumber
    || !normalizedEmail
    || !country
    || !timezone
    || !dateFormat
    || !password
    || !confirmPassword
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'All registration fields are required.');
  }

  if (password !== confirmPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password and confirmPassword must match.');
  }

  if (String(password).length < 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters.');
  }

  const tokenHash = hashInviteToken(token);
  const passwordHash = await hashPassword(password);

  let createdUser;

  await db.$transaction(async (tx) => {
    const invite = await getInvitationByTokenHash(tx, tokenHash);

    if (invite.email.toLowerCase() !== normalizedEmail) {
      throw new AppError(400, 'INVALID_INVITATION_TOKEN', 'Invitation token is invalid or expired.');
    }

    const existing = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    });

    if (existing) {
      throw new AppError(409, 'INVITATION_ALREADY_USED', 'Invitation is no longer valid.');
    }

    await tx.$executeRaw`
      INSERT INTO users
      (email, password_hash, role_code, first_name, last_name, title, phone_number, country, timezone, date_format, status, is_active, created_at, updated_at)
      VALUES
      (${normalizedEmail}, ${passwordHash}, ${invite.role}, ${String(firstName).trim()}, ${String(lastName).trim()}, ${String(title).trim()}, ${String(phoneNumber).trim()}, ${String(country).trim()}, ${String(timezone).trim()}, ${String(dateFormat).trim()}, 'ACTIVE', 1, NOW(), NOW())
    `;

    createdUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        roleCode: true
      }
    });

    await tx.$executeRaw`
      INSERT INTO auth_identities
      (user_id, provider, provider_user_id, provider_email, linked_at, created_at, updated_at)
      VALUES
      (${createdUser.id}, 'credentials', ${createdUser.email}, ${createdUser.email}, NOW(), NOW(), NOW())
    `;

    const updated = await tx.$executeRaw`
      UPDATE user_invitations
      SET status = 'ACCEPTED',
          accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = ${BigInt(invite.id)}
        AND status = 'PENDING'
    `;

    if (!updated) {
      throw new AppError(409, 'INVITATION_ALREADY_USED', 'Invitation is no longer valid.');
    }
  });

  const user = {
    id: Number(createdUser.id),
    email: createdUser.email,
    role: createdUser.roleCode
  };

  const sessionId = generateSessionId();
  const tokenFamily = generateTokenFamily();
  const access = signAccessToken({ user, env, sessionId });
  const refreshToken = signRefreshToken({ userId: user.id, env, sessionId, tokenFamily });

  await persistRefreshToken({
    db,
    userId: user.id,
    refresh: refreshToken,
    sessionId,
    tokenFamily,
    ipAddress,
    userAgent
  });

  return {
    user,
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
      sessionId
    }
  };
}

async function checkPendingInvitationByEmail({ db, email }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true }
  });
  if (existingUser) {
    return {
      email: normalizedEmail,
      canInvite: false,
      reason: 'USER_ALREADY_EXISTS',
      hasValidPendingInvitation: false
    };
  }

  const rows = await db.userInvitation.findMany({
    where: {
      email: normalizedEmail,
      status: { in: ['PENDING', 'ACCEPTED'] }
    },
    select: {
      email: true,
      roleCode: true,
      locationsJson: true,
      status: true,
      expiresAt: true
    },
    orderBy: { id: 'desc' },
    take: 20
  });

  const validInvite = rows.find((row) => {
    const expiresAt = new Date(row.expiresAt);
    return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
  }) || null;
  const hasAccepted = rows.some((row) => row.status === 'ACCEPTED');

  if (!validInvite) {
    if (hasAccepted) {
      return {
        email: normalizedEmail,
        canInvite: false,
        reason: 'INVITATION_ALREADY_ACCEPTED',
        hasValidPendingInvitation: false
      };
    }

    return {
      email: normalizedEmail,
      canInvite: true,
      reason: 'INVITABLE',
      hasValidPendingInvitation: false
    };
  }

  const invite = validInvite;
  return {
    email: invite.email,
    canInvite: false,
    reason: 'PENDING_INVITATION_EXISTS',
    hasValidPendingInvitation: true,
    invitation: {
      role: invite.roleCode,
      locations: parseLocations(invite.locationsJson),
      expiresAt: new Date(invite.expiresAt).toISOString()
    }
  };
}

module.exports = {
  login,
  refresh,
  logout,
  getActiveUserById,
  validateInvitation,
  acceptInvitation,
  checkPendingInvitationByEmail,
  registerInvitedUser
};
