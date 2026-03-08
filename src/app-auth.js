require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { readEnv } = require('./config/env');
const { createPrismaClient } = require('./config/db');
const { authRouter } = require('./modules/auth/auth.routes');
const { usersRouter } = require('./modules/users/users.routes');
const { healthRouter } = require('./modules/health/health.routes');
const { errorHandler } = require('./middleware/errorHandler');

function createAuthApp() {
  const env = readEnv();
  const db = createPrismaClient(env.databaseUrl);
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = express();
  app.locals.env = env;
  app.locals.db = db;

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    })
  );
  app.use(logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(process.cwd(), 'public')));

  app.set('trust proxy', 1);

  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false
    }),
    authRouter
  );

  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1', healthRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createAuthApp };
