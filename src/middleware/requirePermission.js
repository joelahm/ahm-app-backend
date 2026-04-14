const { AppError } = require('../lib/errors');

const PERMISSIONS_SETTINGS_KEY = 'workspace_permissions';
const CACHE_TTL_MS = 30 * 1000;

let permissionsCache = {
  expiresAt: 0,
  value: null
};

function readColumnForRole(role) {
  if (role === 'TEAM_MEMBER') return 'memberEnabled';
  if (role === 'GUEST') return 'guestEnabled';
  return null;
}

async function loadPermissionsSettings(db) {
  const now = Date.now();
  if (permissionsCache.value && permissionsCache.expiresAt > now) {
    return permissionsCache.value;
  }

  const rows = await db.$queryRaw`
    SELECT value_json
    FROM app_settings
    WHERE setting_key = ${PERMISSIONS_SETTINGS_KEY}
    LIMIT 1
  `;

  const value = Array.isArray(rows) && rows.length > 0 ? rows[0].value_json : null;
  const settings = typeof value === 'string' ? JSON.parse(value) : value;

  permissionsCache = {
    expiresAt: now + CACHE_TTL_MS,
    value: settings && typeof settings === 'object' ? settings : null
  };

  return permissionsCache.value;
}

function hasPermission(settings, role, permissionKey) {
  if (!settings || !Array.isArray(settings.sections)) {
    return false;
  }

  for (const section of settings.sections) {
    if (!section || !Array.isArray(section.rows)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    for (const row of section.rows) {
      if (!row || row.key !== permissionKey) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (role === 'ADMIN') {
        return true;
      }

      const column = readColumnForRole(role);
      if (!column) {
        return false;
      }

      return Boolean(row[column]);
    }
  }

  return false;
}

function requirePermission(permissionKey) {
  return async function permissionMiddleware(req, _res, next) {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      if (!permissionKey || typeof permissionKey !== 'string') {
        throw new AppError(500, 'PERMISSION_CONFIG_ERROR', 'Invalid permission configuration.');
      }

      const role = String(req.auth.role || '').trim().toUpperCase();

      if (role === 'ADMIN') {
        return next();
      }

      const settings = await loadPermissionsSettings(req.app.locals.db);
      const allowed = hasPermission(settings, role, permissionKey);

      if (!allowed) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions.');
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requireAnyPermission(permissionKeys) {
  return async function anyPermissionMiddleware(req, _res, next) {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) {
        throw new AppError(500, 'PERMISSION_CONFIG_ERROR', 'Invalid permission configuration.');
      }

      const role = String(req.auth.role || '').trim().toUpperCase();

      if (role === 'ADMIN') {
        return next();
      }

      const settings = await loadPermissionsSettings(req.app.locals.db);
      const allowed = permissionKeys.some((permissionKey) =>
        hasPermission(settings, role, permissionKey)
      );

      if (!allowed) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions.');
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requirePermission, requireAnyPermission };
