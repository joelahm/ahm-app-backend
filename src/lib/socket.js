const { Server } = require('socket.io');
const { verifyAccessToken } = require('./jwt');

function readAllowedOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));
}

function readHandshakeToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const header = socket.handshake.headers?.authorization || '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  return null;
}

async function authenticateSocket({ db, env, socket }) {
  const token = readHandshakeToken(socket);
  if (!token) {
    return null;
  }

  const decoded = verifyAccessToken(token, env);
  const latestSessionToken = await db.refreshToken.findFirst({
    where: { sessionId: decoded.sid },
    orderBy: { id: 'desc' },
    select: { isRevoked: true }
  });

  if (!latestSessionToken || latestSessionToken.isRevoked) {
    return null;
  }

  return {
    email: decoded.email,
    role: decoded.role,
    sessionId: decoded.sid,
    userId: Number(decoded.sub)
  };
}

function attachSocketServer(server, context = {}) {
  const allowedOrigins = readAllowedOrigins();
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        const normalizedOrigin = (origin || '').replace(/\/$/, '');
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true
    }
  });

  io.on('connection', async (socket) => {
    try {
      const auth = context.db && context.env
        ? await authenticateSocket({ db: context.db, env: context.env, socket })
        : null;

      if (auth?.userId) {
        socket.data.auth = auth;
        socket.join(`user:${auth.userId}`);
      }
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.on('scan:subscribe', (payload = {}) => {
      if (payload.scanId) {
        socket.join(`scan:${payload.scanId}`);
      }
      if (payload.runId) {
        socket.join(`scan-run:${payload.runId}`);
      }
    });

    socket.on('scan:unsubscribe', (payload = {}) => {
      if (payload.scanId) {
        socket.leave(`scan:${payload.scanId}`);
      }
      if (payload.runId) {
        socket.leave(`scan-run:${payload.runId}`);
      }
    });
  });

  return io;
}

module.exports = { attachSocketServer };
