const ACCESS_COOKIE_NAME = 'accessToken';
const REFRESH_COOKIE_NAME = 'refreshToken';

function buildCookieOptions(env, maxAgeMs) {
  return {
    httpOnly: true,
    secure: env.authCookies.secure,
    sameSite: env.authCookies.sameSite,
    domain: env.authCookies.domain || undefined,
    path: '/',
    maxAge: maxAgeMs
  };
}

function setAuthCookies(res, env, tokens) {
  const nowMs = Date.now();
  const accessMaxAgeMs = Math.max(tokens.accessTokenExpiresAt * 1000 - nowMs, 0);
  const refreshMaxAgeMs = Math.max(tokens.refreshTokenExpiresAt * 1000 - nowMs, 0);

  res.cookie(
    env.authCookies.accessCookieName,
    tokens.accessToken,
    buildCookieOptions(env, accessMaxAgeMs)
  );

  res.cookie(
    env.authCookies.refreshCookieName,
    tokens.refreshToken,
    buildCookieOptions(env, refreshMaxAgeMs)
  );
}

function clearAuthCookies(res, env) {
  const options = {
    httpOnly: true,
    secure: env.authCookies.secure,
    sameSite: env.authCookies.sameSite,
    domain: env.authCookies.domain || undefined,
    path: '/'
  };

  res.clearCookie(env.authCookies.accessCookieName, options);
  res.clearCookie(env.authCookies.refreshCookieName, options);
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
  clearAuthCookies
};
