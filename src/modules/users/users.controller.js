const { AppError } = require('../../lib/errors');
const usersService = require('./users.service');
const fs = require('fs/promises');
const path = require('path');

function readUserId(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid user id.');
  }
  return id;
}

function resolveRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' && forwardedProto
    ? forwardedProto.split(',')[0].trim()
    : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function toAbsoluteAvatarUrl(req, avatarUrl) {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  const origin = resolveRequestOrigin(req);
  return `${origin}${avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`}`;
}

async function listUsers(req, res, next) {
  try {
    const data = await usersService.listUsers({
      db: req.app.locals.db,
      page: req.query.page,
      limit: req.query.limit
    });

    const users = data.users.map((user) => ({
      ...user,
      avatarPath: user.avatarUrl || null,
      avatarUrl: toAbsoluteAvatarUrl(req, user.avatarUrl)
    }));

    res.status(200).json({
      ...data,
      users
    });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const user = await usersService.createUser({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

async function patchMe(req, res, next) {
  try {
    const data = await usersService.updateOwnProfile({
      db: req.app.locals.db,
      userId: req.auth.userId,
      payload: {
        ...(req.body || {}),
        filePath: req.file?.path
      }
    });

    res.status(200).json(data);
  } catch (err) {
    if (req.file?.path) {
      const uploadedPath = path.resolve(req.file.path);
      fs.unlink(uploadedPath).catch(() => {});
    }
    next(err);
  }
}

async function patchUser(req, res, next) {
  try {
    const userId = readUserId(req);
    await usersService.updateUser({
      db: req.app.locals.db,
      userId,
      payload: req.body || {}
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function patchUserRole(req, res, next) {
  try {
    const userId = readUserId(req);
    const { role } = req.body || {};
    const data = await usersService.updateUserRole({
      db: req.app.locals.db,
      userId,
      role
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function patchPassword(req, res, next) {
  try {
    const userId = readUserId(req);
    const { newPassword } = req.body || {};
    await usersService.updatePassword({
      db: req.app.locals.db,
      userId,
      newPassword
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function patchMyPassword(req, res, next) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    await usersService.changeOwnPassword({
      db: req.app.locals.db,
      userId: req.auth.userId,
      currentPassword,
      newPassword,
      confirmPassword
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function patchAvatar(req, res, next) {
  try {
    const userId = readUserId(req);
    const user = await usersService.updateAvatar({
      db: req.app.locals.db,
      userId,
      filePath: req.file?.path
    });

    res.status(200).json({ user });
  } catch (err) {
    if (req.file?.path) {
      const uploadedPath = path.resolve(req.file.path);
      fs.unlink(uploadedPath).catch(() => {});
    }
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const userId = readUserId(req);
    const data = await usersService.softDeleteUser({
      db: req.app.locals.db,
      userId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function inviteUsers(req, res, next) {
  try {
    const data = await usersService.inviteUsers({
      db: req.app.locals.db,
      env: req.app.locals.env,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  createUser,
  patchMe,
  patchUser,
  patchUserRole,
  patchPassword,
  patchMyPassword,
  patchAvatar,
  deleteUser,
  inviteUsers
};
