const { AppError } = require('../../lib/errors');
const { hashPassword } = require('../../lib/password');
const { verifyPassword } = require('../../lib/password');
const { generateInviteToken, hashInviteToken } = require('../../lib/inviteToken');
const { sendInviteEmail } = require('../../lib/mailer');
const fs = require('fs/promises');
const path = require('path');

const ALLOWED_ROLES = new Set(['ADMIN', 'TEAM_MEMBER']);
const ALLOWED_STATUS = new Set(['ACTIVE', 'DISABLED', 'LOCKED', 'DELETED']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueViolation(err) {
  return err && err.code === 'P2002';
}

function mapUserSummary(user) {
  return {
    id: Number(user.id),
    email: user.email,
    role: user.roleCode,
    status: user.status,
    isActive: user.isActive,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl ?? null,
    title: user.title ?? null,
    phoneNumber: user.phoneNumber ?? null,
    country: user.country ?? null,
    timezone: user.timezone ?? null,
    dateFormat: user.dateFormat ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function listUsers({ db, page = 1, limit = 20 }) {
  const usersPage = Number(page);
  const usersLimit = Number(limit);

  if (!Number.isInteger(usersPage) || usersPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(usersLimit) || usersLimit <= 0 || usersLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const skip = (usersPage - 1) * usersLimit;
  const activeFilter = {
    status: 'ACTIVE',
    isActive: true
  };
  const [total, users] = await Promise.all([
    db.user.count({ where: activeFilter }),
    db.user.findMany({
      where: activeFilter,
      skip,
      take: usersLimit,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        roleCode: true,
        status: true,
        isActive: true,
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
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / usersLimit));
  const hasPrev = usersPage > 1;
  const hasNext = usersPage < totalPages;

  return {
    users: users.map(mapUserSummary),
    pagination: {
      page: usersPage,
      limit: usersLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? usersPage - 1 : null,
      nextPage: hasNext ? usersPage + 1 : null
    }
  };
}

async function createUser({ db, actorUserId, payload }) {
  const email = String(payload.email || '').toLowerCase().trim();
  const password = payload.password;
  const role = payload.role || 'TEAM_MEMBER';

  if (!email || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email and password are required.');
  }

  if (!ALLOWED_ROLES.has(role)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid role value.');
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        roleCode: role,
        firstName: payload.firstName || null,
        lastName: payload.lastName || null,
        status: payload.status || 'ACTIVE',
        isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
        createdBy: BigInt(actorUserId)
      },
      select: {
        id: true,
        email: true,
        roleCode: true,
        status: true,
        isActive: true
      }
    });

    return {
      id: Number(user.id),
      email: user.email,
      role: user.roleCode,
      status: user.status,
      isActive: user.isActive
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
    }
    throw err;
  }
}

async function updateUser({ db, userId, payload }) {
  const patch = {};

  if (payload.email !== undefined) {
    patch.email = String(payload.email).toLowerCase().trim();
  }
  if (payload.role !== undefined) {
    if (!ALLOWED_ROLES.has(payload.role)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid role value.');
    }
    patch.roleCode = payload.role;
  }
  if (payload.status !== undefined) {
    if (!ALLOWED_STATUS.has(payload.status)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid status value.');
    }
    patch.status = payload.status;
  }
  if (payload.firstName !== undefined) {
    patch.firstName = payload.firstName;
  }
  if (payload.lastName !== undefined) {
    patch.lastName = payload.lastName;
  }
  if (payload.isActive !== undefined) {
    patch.isActive = Boolean(payload.isActive);
  }

  const keys = Object.keys(patch);
  if (!keys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported fields to update.');
  }

  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: patch
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
    }
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }
}

async function updateOwnProfile({ db, userId, payload }) {
  const patch = {};
  let nextAvatarUrl = null;

  if (payload.email !== undefined) {
    patch.email = String(payload.email).toLowerCase().trim();
  }
  if (payload.firstName !== undefined) {
    patch.firstName = payload.firstName;
  }
  if (payload.lastName !== undefined) {
    patch.lastName = payload.lastName;
  }
  if (payload.title !== undefined) {
    patch.title = payload.title;
  }
  if (payload.phoneNumber !== undefined) {
    patch.phoneNumber = payload.phoneNumber;
  }
  if (payload.country !== undefined) {
    patch.country = payload.country;
  }
  if (payload.timezone !== undefined) {
    patch.timezone = payload.timezone;
  }
  if (payload.dateFormat !== undefined) {
    patch.dateFormat = payload.dateFormat;
  }
  if (payload.filePath) {
    const normalizedPath = String(payload.filePath).replace(/\\/g, '/');
    const publicPrefix = `${process.cwd().replace(/\\/g, '/')}/public/`;
    const relative = normalizedPath.startsWith(publicPrefix)
      ? normalizedPath.slice(publicPrefix.length)
      : normalizedPath.split('/public/')[1];

    if (!relative) {
      throw new AppError(500, 'UPLOAD_ERROR', 'Could not determine uploaded file path.');
    }

    nextAvatarUrl = `/${relative}`;
    patch.avatarUrl = nextAvatarUrl;
  }

  const keys = Object.keys(patch);
  if (!keys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported fields to update.');
  }

  try {
    const previous = nextAvatarUrl
      ? await db.user.findUnique({
        where: { id: BigInt(userId) },
        select: { avatarUrl: true }
      })
      : null;
    const previousAvatarUrl = previous?.avatarUrl || null;

    await db.user.update({
      where: { id: BigInt(userId) },
      data: patch
    });

    if (nextAvatarUrl && previousAvatarUrl && previousAvatarUrl !== nextAvatarUrl && previousAvatarUrl.startsWith('/uploads/avatars/')) {
      const oldFilePath = path.join(process.cwd(), 'public', previousAvatarUrl.replace(/^\//, ''));
      fs.unlink(oldFilePath).catch(() => {});
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
    }
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  return { success: true };
}

async function updateUserRole({ db, userId, role }) {
  const nextRole = String(role || '').trim().toUpperCase();
  if (!ALLOWED_ROLES.has(nextRole)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid role value.');
  }

  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: { roleCode: nextRole }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  return { success: true };
}

async function updatePassword({ db, userId, newPassword }) {
  if (!newPassword || String(newPassword).length < 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters.');
  }

  const passwordHash = await hashPassword(newPassword);

  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: {
        passwordHash,
        passwordChangedAt: new Date()
      }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  await db.refreshToken.updateMany({
    where: { userId: BigInt(userId), isRevoked: false },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'PASSWORD_CHANGED'
    }
  });
}

async function changeOwnPassword({ db, userId, currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'currentPassword, newPassword and confirmPassword are required.'
    );
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'newPassword and confirmPassword must match.');
  }

  const user = await db.user.findUnique({
    where: { id: BigInt(userId) },
    select: { passwordHash: true }
  });

  if (!user || !user.passwordHash) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }

  const validCurrentPassword = await verifyPassword(currentPassword, user.passwordHash);
  if (!validCurrentPassword) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  await updatePassword({ db, userId, newPassword });
  return { success: true };
}

async function updateAvatar({ db, userId, filePath }) {
  if (!filePath) {
    throw new AppError(400, 'VALIDATION_ERROR', 'avatar file is required.');
  }

  const normalizedPath = String(filePath).replace(/\\/g, '/');
  const publicPrefix = `${process.cwd().replace(/\\/g, '/')}/public/`;
  const relative = normalizedPath.startsWith(publicPrefix)
    ? normalizedPath.slice(publicPrefix.length)
    : normalizedPath.split('/public/')[1];

  if (!relative) {
    throw new AppError(500, 'UPLOAD_ERROR', 'Could not determine uploaded file path.');
  }

  const avatarUrl = `/${relative}`;

  try {
    const previous = await db.user.findUnique({
      where: { id: BigInt(userId) },
      select: { avatarUrl: true }
    });
    const previousAvatarUrl = previous?.avatarUrl || null;

    const updated = await db.user.update({
      where: { id: BigInt(userId) },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        roleCode: true,
        status: true,
        isActive: true,
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

    if (previousAvatarUrl && previousAvatarUrl !== avatarUrl && previousAvatarUrl.startsWith('/uploads/avatars/')) {
      const oldFilePath = path.join(process.cwd(), 'public', previousAvatarUrl.replace(/^\//, ''));
      fs.unlink(oldFilePath).catch(() => {});
    }

    return mapUserSummary(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }
}

async function softDeleteUser({ db, userId }) {
  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: {
        status: 'DELETED',
        isActive: false
      }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  await db.refreshToken.updateMany({
    where: { userId: BigInt(userId), isRevoked: false },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'USER_SOFT_DELETED'
    }
  });

  return { success: true };
}

function normalizeMembers(memberList) {
  const mapped = memberList
    .map((member) => ({
      email: String(member?.email || '').trim().toLowerCase(),
      role: normalizeRole(member?.role || 'TEAM_MEMBER')
    }))
    .filter((member) => member.email);

  // Keep first occurrence for duplicate emails.
  const unique = [];
  const seen = new Set();
  for (const member of mapped) {
    if (seen.has(member.email)) continue;
    seen.add(member.email);
    unique.push(member);
  }
  return unique;
}

function normalizeRole(roleValue) {
  const cleaned = String(roleValue || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (cleaned === 'TEAM_MEMBER' || cleaned === 'TEAMMEMBER') return 'TEAM_MEMBER';
  if (cleaned === 'ADMIN') return 'ADMIN';
  return cleaned;
}

function normalizeLocations(locationList) {
  const cleaned = locationList
    .map((location) => String(location || '').trim())
    .filter(Boolean);

  return [...new Set(cleaned)];
}

async function inviteUsers({ db, env, actorUserId, payload }) {
  const requestedByUserIdRaw = payload.requestedByUserId;
  const requestedByUserId = requestedByUserIdRaw === undefined
    ? actorUserId
    : Number(requestedByUserIdRaw);

  if (!Number.isFinite(requestedByUserId) || requestedByUserId <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'requestedByUserId must be a positive number.');
  }

  if (requestedByUserId !== actorUserId) {
    throw new AppError(403, 'FORBIDDEN', 'requestedByUserId must match the authenticated user.');
  }

  const members = normalizeMembers(Array.isArray(payload.members) ? payload.members : []);
  const locations = normalizeLocations(Array.isArray(payload.locations) ? payload.locations : []);

  if (!members.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'members must be a non-empty array.');
  }

  if (!env.invite.baseUrl) {
    throw new AppError(500, 'INVITE_CONFIG_ERROR', 'INVITE_BASE_URL (or APP_BASE_URL) is required.');
  }

  const invalidRole = members.find((member) => !ALLOWED_ROLES.has(member.role));
  if (invalidRole) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid role value for ${invalidRole.email}.`);
  }

  const emails = members.map((member) => member.email);
  const existingUsers = await db.user.findMany({
    where: { email: { in: emails } },
    select: { email: true }
  });
  const existingInvitations = await db.userInvitation.findMany({
    where: {
      email: { in: emails },
      status: { in: ['PENDING', 'ACCEPTED'] }
    },
    select: {
      email: true,
      status: true,
      expiresAt: true
    },
    orderBy: { id: 'desc' }
  });

  const existingSet = new Set(existingUsers.map((user) => user.email.toLowerCase()));
  const invitationStateByEmail = new Map();
  for (const row of existingInvitations) {
    const key = row.email.toLowerCase();
    const prev = invitationStateByEmail.get(key) || {
      hasAccepted: false,
      hasPendingValid: false
    };
    if (row.status === 'ACCEPTED') {
      prev.hasAccepted = true;
    }
    if (row.status === 'PENDING') {
      const expiresAt = new Date(row.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()) {
        prev.hasPendingValid = true;
      }
    }
    invitationStateByEmail.set(key, prev);
  }
  const results = [];

  for (const member of members) {
    const { email, role } = member;

    if (!EMAIL_REGEX.test(email)) {
      results.push({ email, status: 'SKIPPED_INVALID_EMAIL' });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (existingSet.has(email)) {
      results.push({ email, status: 'SKIPPED_USER_EXISTS' });
      // eslint-disable-next-line no-continue
      continue;
    }
    const inviteState = invitationStateByEmail.get(email);
    if (inviteState?.hasAccepted) {
      results.push({ email, status: 'SKIPPED_INVITATION_ALREADY_ACCEPTED' });
      // eslint-disable-next-line no-continue
      continue;
    }
    if (inviteState?.hasPendingValid) {
      results.push({ email, status: 'SKIPPED_PENDING_INVITATION_EXISTS' });
      // eslint-disable-next-line no-continue
      continue;
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + env.invite.expiresInHours * 60 * 60 * 1000);

    await db.$executeRaw`
      INSERT INTO user_invitations
      (email, role_code, locations_json, token_hash, invited_by, status, expires_at, updated_at)
      VALUES
      (${email}, ${role}, ${JSON.stringify(locations)}, ${tokenHash}, ${BigInt(requestedByUserId)}, 'PENDING', ${expiresAt}, NOW())
    `;

    const inviteUrl = `${env.invite.baseUrl.replace(/\/$/, '')}?token=${encodeURIComponent(token)}`;

    try {
      await sendInviteEmail({
        env,
        to: email,
        inviteUrl,
        role
      });

      await db.$executeRaw`
        UPDATE user_invitations
        SET sent_at = NOW(), updated_at = NOW()
        WHERE token_hash = ${tokenHash}
      `;

      results.push({ email, role, status: 'INVITED' });
    } catch (error) {
      await db.$executeRaw`
        UPDATE user_invitations
        SET status = 'FAILED', updated_at = NOW()
        WHERE token_hash = ${tokenHash}
      `;
      results.push({ email, role, status: 'FAILED_TO_SEND' });
    }
  }

  const summary = results.reduce(
    (acc, row) => {
      if (row.status === 'INVITED') acc.invited += 1;
      else if (row.status === 'FAILED_TO_SEND') acc.failed += 1;
      else acc.skipped += 1;
      return acc;
    },
    { invited: 0, failed: 0, skipped: 0 }
  );

  return { summary, locations, results };
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  updateOwnProfile,
  updateUserRole,
  updatePassword,
  changeOwnPassword,
  updateAvatar,
  softDeleteUser,
  inviteUsers
};
