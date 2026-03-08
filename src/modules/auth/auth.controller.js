const { AppError } = require('../../lib/errors');
const authService = require('./auth.service');

function readIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

function readUserAgent(req) {
  return req.headers['user-agent'] || null;
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw new AppError(400, 'VALIDATION_ERROR', 'email and password are required.');
    }

    const data = await authService.login({
      db: req.app.locals.db,
      env: req.app.locals.env,
      email: String(email).toLowerCase().trim(),
      password,
      ipAddress: readIp(req),
      userAgent: readUserAgent(req)
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      throw new AppError(400, 'VALIDATION_ERROR', 'refreshToken is required.');
    }

    const data = await authService.refresh({
      db: req.app.locals.db,
      env: req.app.locals.env,
      refreshToken,
      ipAddress: readIp(req),
      userAgent: readUserAgent(req)
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      throw new AppError(400, 'VALIDATION_ERROR', 'refreshToken is required.');
    }

    await authService.logout({
      db: req.app.locals.db,
      env: req.app.locals.env,
      refreshToken
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getActiveUserById(req.app.locals.db, req.auth.userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me
};
