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
const { clientsRouter } = require('./modules/clients/clients.routes');
const { projectsRouter } = require('./modules/projects/projects.routes');
const { integrationsRouter } = require('./modules/integrations/integrations.routes');
const { scansRouter } = require('./modules/scans/scans.routes');
const { projectTemplatesRouter } = require('./modules/project-templates/project-templates.routes');
const { aiPromptsRouter } = require('./modules/ai-prompts/ai-prompts.routes');
const { citationDatabaseRouter } = require('./modules/citation-database/citation-database.routes');
const { schemaGeneratorSettingsRouter } = require('./modules/schema-generator-settings/schema-generator-settings.routes');
const { generatedSchemasRouter } = require('./modules/generated-schemas/generated-schemas.routes');
const { keywordContentListsRouter } = require('./modules/keyword-content-lists/keyword-content-lists.routes');
const { healthRouter } = require('./modules/health/health.routes');
const { notFoundHandler } = require('./middleware/notFoundHandler');
const { errorHandler } = require('./middleware/errorHandler');

function createAuthApp() {
  const env = readEnv();
  const db = createPrismaClient(env.databaseUrl);
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));

  const app = express();
  app.locals.env = env;
  app.locals.db = db;

  app.use(
    helmet({
      // Allow frontend on a different origin to render uploaded images.
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        const normalizedOrigin = (origin || '').replace(/\/$/, '');

        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }

        // Reject without throwing a server error for CORS mismatch.
        return callback(null, false);
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
  app.use('/api/v1/clients', clientsRouter);
  app.use('/api/v1/projects', projectsRouter);
  app.use('/api/v1/integrations', integrationsRouter);
  app.use('/api/v1/scans', scansRouter);
  app.use('/api/v1/project-templates', projectTemplatesRouter);
  app.use('/api/v1/ai-prompts', aiPromptsRouter);
  app.use('/api/v1/citation-database', citationDatabaseRouter);
  app.use('/api/v1/schema-generator-settings', schemaGeneratorSettingsRouter);
  app.use('/api/v1/generated-schemas', generatedSchemasRouter);
  app.use('/api/v1/keyword-content-lists', keywordContentListsRouter);
  app.use('/api/v1', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createAuthApp };
