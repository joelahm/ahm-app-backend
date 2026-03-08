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
    }
  };
}

module.exports = { readEnv };
