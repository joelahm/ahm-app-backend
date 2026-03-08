const { AppError } = require('../../lib/errors');
const usersService = require('./users.service');

function readUserId(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid user id.');
  }
  return id;
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

module.exports = {
  createUser,
  patchUser,
  patchPassword
};
