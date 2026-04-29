function toMysqlUrl() {
  const host = process.env.MYSQL_HOST;
  const port = process.env.MYSQL_PORT || '3306';
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE;

  if (!host || !user || !database) {
    return null;
  }

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function readSameSite() {
  const value = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (value === 'lax' || value === 'strict' || value === 'none') {
    return value;
  }
  return 'lax';
}

function readSmtpAuthMode() {
  const mode = (process.env.SMTP_AUTH_MODE || 'password').toLowerCase();
  if (mode === 'password' || mode === 'google_oauth2' || mode === 'auto') {
    return mode;
  }
  return 'password';
}

function readBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function readPositiveInteger(value, defaultValue) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

function readEnv() {
  const required = ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const databaseUrl = process.env.DATABASE_URL || toMysqlUrl();
  if (!databaseUrl) {
    throw new Error('Missing required database configuration. Set DATABASE_URL or MYSQL_* variables.');
  }

  const nodeEnv = process.env.NODE_ENV || 'development';
  const cookieSecureDefault = nodeEnv === 'production' ? 'true' : 'false';

  return {
    nodeEnv,
    port: Number(process.env.PORT || 3000),
    databaseUrl,
    authCookies: {
      accessCookieName: process.env.ACCESS_COOKIE_NAME || 'accessToken',
      refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refreshToken',
      secure: String(process.env.COOKIE_SECURE || cookieSecureDefault).toLowerCase() === 'true',
      sameSite: readSameSite(),
      domain: process.env.COOKIE_DOMAIN || null
    },
    jwt: {
      issuer: process.env.JWT_ISSUER || 'ahm-backend',
      audience: process.env.JWT_AUDIENCE || 'ahm-web',
      accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
      refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
      accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
      refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 2592000)
    },
    invite: {
      expiresInHours: Number(process.env.INVITE_EXPIRES_HOURS || 72),
      baseUrl: process.env.INVITE_BASE_URL || process.env.APP_BASE_URL || null
    },
    websiteContentReview: {
      linkExpiresDays: readPositiveInteger(
        process.env.WEBSITE_CONTENT_REVIEW_LINK_EXPIRES_DAYS,
        14
      ),
      otpExpiresMinutes: readPositiveInteger(
        process.env.WEBSITE_CONTENT_REVIEW_OTP_EXPIRES_MINUTES,
        10
      ),
      sessionExpiresHours: readPositiveInteger(
        process.env.WEBSITE_CONTENT_REVIEW_SESSION_EXPIRES_HOURS,
        24
      )
    },
    email: {
      authMode: readSmtpAuthMode(),
      host: process.env.SMTP_HOST || null,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || null,
      pass: process.env.SMTP_PASS || null,
      from: process.env.SMTP_FROM || null,
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      googleClientId: process.env.GOOGLE_SMTP_CLIENT_ID || null,
      googleClientSecret: process.env.GOOGLE_SMTP_CLIENT_SECRET || null,
      googleRefreshToken: process.env.GOOGLE_SMTP_REFRESH_TOKEN || null
    },
    integrations: {
      aiTitleProvider: String(process.env.AI_TITLE_PROVIDER || 'MANUS').trim().toUpperCase(),
      dataForSeo: {
        baseUrl: process.env.DATAFORSEO_BASE_URL || 'https://api.dataforseo.com',
        login: process.env.DATAFORSEO_LOGIN || null,
        password: process.env.DATAFORSEO_PASSWORD || null,
        cacheTtlMinutes: Number(process.env.DATAFORSEO_CACHE_TTL_MINUTES || 1440)
      },
      serpApi: {
        baseUrl: process.env.SERPAPI_BASE_URL || 'https://serpapi.com',
        apiKey: process.env.SERPAPI_API_KEY || null,
        cacheTtlMinutes: Number(process.env.SERPAPI_CACHE_TTL_MINUTES || 1440)
      },
      manus: {
        baseUrl: process.env.MANUS_API_BASE_URL || 'https://api.manus.ai',
        apiKey: process.env.MANUS_API_KEY || null,
        pollIntervalMs: Number(process.env.MANUS_POLL_INTERVAL_MS || 1500),
        maxPollAttempts: Number(process.env.MANUS_MAX_POLL_ATTEMPTS || 80)
      },
      openai: {
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
        apiKey: process.env.OPENAI_API_KEY || null,
        model: process.env.OPENAI_MODEL || 'gpt-5.2',
        maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 120)
      },
      anthropic: {
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        apiKey: process.env.ANTHROPIC_API_KEY || null,
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        maxOutputTokens: readPositiveInteger(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 4096)
      },
      discord: {
        botToken: process.env.DISCORD_BOT_TOKEN || null
      }
    },
    scans: {
      schedulerEnabled: readBoolean(process.env.SCAN_SCHEDULER_ENABLED, true),
      schedulerPollIntervalMs: readPositiveInteger(
        process.env.SCAN_SCHEDULER_POLL_INTERVAL_MS,
        60_000
      ),
      schedulerBatchSize: readPositiveInteger(
        process.env.SCAN_SCHEDULER_BATCH_SIZE,
        10
      )
    }
  };
}

module.exports = { readEnv };
