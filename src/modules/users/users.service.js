const { AppError } = require('../../lib/errors');
const { hashPassword } = require('../../lib/password');

const ALLOWED_ROLES = new Set(['ADMIN', 'TEAM_MEMBER']);
const ALLOWED_STATUS = new Set(['ACTIVE', 'DISABLED', 'LOCKED']);

function isUniqueViolation(err) {
  return err && err.code === 'P2002';
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

module.exports = {
  createUser,
  updateUser,
  updatePassword
};
