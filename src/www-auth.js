#!/usr/bin/env node

const http = require('http');
const debug = require('debug')('ahm-app-backend:server');
const { createAuthApp } = require('./app-auth');

const app = createAuthApp();
const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

const server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

async function shutdown(signal) {
  try {
    await app.locals.db.$disconnect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Prisma disconnect error:', err.message);
  } finally {
    process.exit(signal ? 0 : 1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function normalizePort(val) {
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) return val;
  if (parsed >= 0) return parsed;
  return false;
}

function onError(error) {
  if (error.syscall !== 'listen') throw error;

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  debug(`Listening on ${bind}`);
}
