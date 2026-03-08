const { AppError } = require('../lib/errors');
const { verifyAccessToken } = require('../lib/jwt');

async function authenticateAccessToken(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing access token.');
    }

    const decoded = verifyAccessToken(token, req.app.locals.env);

    const latestSessionToken = await req.app.locals.db.refreshToken.findFirst({
      where: { sessionId: decoded.sid },
      orderBy: { id: 'desc' },
      select: { isRevoked: true }
    });

    if (!latestSessionToken || latestSessionToken.isRevoked) {
      throw new AppError(401, 'UNAUTHORIZED', 'Session revoked or not found.');
    }

    req.auth = {
      userId: Number(decoded.sub),
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sid
    };

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid or expired access token.'));
    }
    return next(err);
  }
}

module.exports = { authenticateAccessToken };
