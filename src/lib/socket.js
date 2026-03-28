const { Server } = require('socket.io');

function readAllowedOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));
}

function attachSocketServer(server) {
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

  io.on('connection', (socket) => {
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
