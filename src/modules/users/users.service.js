const { AppError } = require('../../lib/errors');
const { hashPassword } = require('../../lib/password');
const { verifyPassword } = require('../../lib/password');
const { generateInviteToken, hashInviteToken } = require('../../lib/inviteToken');
const { sendInviteEmail } = require('../../lib/mailer');
const fs = require('fs/promises');
const path = require('path');

const ALLOWED_ROLES = new Set(['ADMIN', 'TEAM_MEMBER', 'GUEST']);
const ALLOWED_STATUS = new Set(['ACTIVE', 'DISABLED', 'LOCKED', 'DELETED']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERMISSIONS_SETTINGS_KEY = 'workspace_permissions';

const DEFAULT_PERMISSIONS_SETTINGS = {
  sections: [
    {
      key: 'user-role-and-permissions',
      title: 'User Role and Permissions',
      description:
        'Control who can manage users, assign roles, and update permission levels within the workspace.',
      hasGuestColumn: false,
      rows: [
        {
          key: 'add-new-user',
          title: 'Add New User',
          description: 'Allow users to invite new users to the workspace',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'remove-user',
          title: 'Remove User',
          description: 'Allow users to remove existing members from the workspace.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'change-user-role',
          title: 'Change User Role',
          description: 'Allow users to update roles of existing users.',
          memberEnabled: false,
          adminEnabled: true
        }
      ]
    },
    {
      key: 'gbp-posts',
      title: 'GBP Posts',
      description:
        'Manage who can view, create, schedule, publish, and edit Google Business Profile posts.',
      hasGuestColumn: false,
      rows: [
        {
          key: 'view-posts',
          title: 'View Posts',
          description: 'Allow users to view Google Business Profile posts.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'create-draft-posts',
          title: 'Create Draft Posts',
          description: 'Allow users to create and save draft posts.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'schedule-gbp-posts',
          title: 'Schedule GBP Posts',
          description: 'Allow users to schedule posts for future publishing.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'publish-immediately',
          title: 'Publish Immediately',
          description: 'Allow users to publish posts instantly.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'edit-delete-published-posts',
          title: 'Edit/Delete Published Posts',
          description: 'Allow users to edit or remove published posts.',
          memberEnabled: false,
          adminEnabled: true
        }
      ]
    },
    {
      key: 'google-reviews',
      title: 'Google Reviews',
      description:
        'Control access to viewing, replying to, and managing Google reviews and reply templates.',
      hasGuestColumn: false,
      rows: [
        {
          key: 'reply-to-reviews',
          title: 'Reply To Reviews',
          description: 'Allow users to respond to customer reviews.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'use-reply-templates',
          title: 'Use Reply Templates',
          description: 'Allow users to use pre-saved reply templates.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'manage-review-templates',
          title: 'Manage Review Templates',
          description: 'Allow users to create, edit, and manage review reply templates.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'manage-ai-auto-reply',
          title: 'Manage AI Auto-Reply',
          description: 'Allow users to configure and manage AI-powered automatic replies.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'delete-replies',
          title: 'Delete Replies',
          description: 'Allow users to remove published review replies.',
          memberEnabled: false,
          adminEnabled: true
        }
      ]
    },
    {
      key: 'local-rank-scanner',
      title: 'Local Rank Scanner',
      description: 'Manage access to scans, results, and reports.',
      hasGuestColumn: false,
      rows: [
        {
          key: 'local-rank-scanner-access',
          title: 'Local Rank Scanner Access',
          description: 'Allow users to access the Local Rank Scanner feature.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'view-scan-results',
          title: 'View Scan Results',
          description: 'Allow users to view local ranking scan results and historical data.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'run-quick-scans',
          title: 'Run Quick Scans',
          description: 'Allow users to run one-time local rank scans.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'run-recurring-scans',
          title: 'Run Recurring Scans',
          description: 'Allow users to schedule and run automated recurring rank scans.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'export-scan-reports',
          title: 'Export Scan Reports',
          description: 'Allow users to export local rank scan reports for sharing or analysis.',
          memberEnabled: false,
          adminEnabled: true
        }
      ]
    },
    {
      key: 'schema-generator',
      title: 'Schema Generator',
      description:
        'Manage access to the Schema Generator module, including creating, editing, and exporting schema markup.',
      hasGuestColumn: true,
      rows: [
        {
          key: 'schema-generator-access',
          title: 'Schema Generator Access',
          description: 'Allow users to access and view the Schema Generator feature',
          guestEnabled: true,
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'generate-schema',
          title: 'Generate schema',
          description: 'Allow users to create new schema markup.',
          guestEnabled: false,
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'edit-schema',
          title: 'Edit schema',
          description: 'Allow users to modify existing schema markup.',
          guestEnabled: false,
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'export-json',
          title: 'Export JSON',
          description: 'Allow users to export schema markup in JSON format.',
          guestEnabled: false,
          memberEnabled: true,
          adminEnabled: true
        }
      ]
    },
    {
      key: 'directory-listing',
      title: 'Directory Listing',
      description:
        'Control permissions for managing business listings, citations, and directory submissions.',
      hasGuestColumn: true,
      rows: [
        {
          key: 'edit-location-information',
          title: 'Edit Location Information',
          description: 'Allow users to edit business location details used for directory and citation listings.',
          guestEnabled: true,
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'delete-archive-listings',
          title: 'Delete / Archive Listings',
          description: 'Allow users to delete or archive existing directory listings.',
          guestEnabled: false,
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'export-reporting',
          title: 'Export Reporting',
          description: 'Allow users to export directory listing reports and status summaries.',
          guestEnabled: false,
          memberEnabled: false,
          adminEnabled: true
        }
      ]
    },
    {
      key: 'client-management-permissions',
      title: 'Client Management Permissions',
      description:
        'Manage access to business locations, including viewing, editing, syncing, and performance insights.',
      hasGuestColumn: false,
      rows: [
        {
          key: 'add-new-client',
          title: 'Add New Client',
          description: 'Allow users to add and connect new business locations.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 'edit-location-details',
          title: 'Edit Location Details (NAP, Category, Services)',
          description:
            'Allow users to update assigned location information including categories, services, and business details.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'remove-client',
          title: 'Remove Client',
          description: 'Allow users to permanently remove assigned location from the workspace.',
          memberEnabled: true,
          adminEnabled: true
        },
        {
          key: 're-sync-location',
          title: 'Re-Sync Location',
          description: 'Allow users to refresh and re-sync assigned location data from Google Business Profile.',
          memberEnabled: false,
          adminEnabled: true
        },
        {
          key: 'view-performance-dashboard',
          title: 'View Performance Dashboard',
          description:
            'Allow users to view analytics, rankings, and performance insights for assigned locations',
          memberEnabled: false,
          adminEnabled: true
        }
      ]
    }
  ]
};

function isUniqueViolation(err) {
  return err && err.code === 'P2002';
}

function cloneDefaultPermissionsSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS));
}

function normalizePermissionRow(section, row) {
  if (typeof row !== 'object' || row === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid permission row.');
  }

  return {
    key: String(row.key || '').trim(),
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim(),
    ...(section.hasGuestColumn ? { guestEnabled: Boolean(row.guestEnabled) } : {}),
    memberEnabled: Boolean(row.memberEnabled),
    adminEnabled: true
  };
}

function normalizePermissionSection(section) {
  if (typeof section !== 'object' || section === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid permission section.');
  }

  const rows = Array.isArray(section.rows) ? section.rows.map((row) => normalizePermissionRow(section, row)) : [];

  if (!rows.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Permission sections must include rows.');
  }

  return {
    key: String(section.key || '').trim(),
    title: String(section.title || '').trim(),
    description: String(section.description || '').trim(),
    hasGuestColumn: Boolean(section.hasGuestColumn),
    rows
  };
}

function normalizePermissionsPayload(payload) {
  const sections = Array.isArray(payload?.sections) ? payload.sections.map(normalizePermissionSection) : null;

  if (!sections || !sections.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'sections is required.');
  }

  return { sections };
}

function parseStoredPermissionsValue(rawValue) {
  if (!rawValue) {
    return cloneDefaultPermissionsSettings();
  }

  if (typeof rawValue === 'string') {
    try {
      return normalizePermissionsPayload(JSON.parse(rawValue));
    } catch (_error) {
      return cloneDefaultPermissionsSettings();
    }
  }

  return normalizePermissionsPayload(rawValue);
}

function mapUserSummary(user) {
  return {
    id: Number(user.id),
    email: user.email,
    role: user.roleCode,
    status: user.status,
    isActive: user.isActive,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl ?? null,
    title: user.title ?? null,
    phoneNumber: user.phoneNumber ?? null,
    country: user.country ?? null,
    timezone: user.timezone ?? null,
    dateFormat: user.dateFormat ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function buildArchivedUserEmail(email, userId) {
  const local = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase() || 'user';
  const suffix = `${Date.now()}-${String(userId)}`;
  return `${local}+deleted-${suffix}@archived.local`;
}

function parseInvitationLocations(locationsJson) {
  if (!locationsJson) {
    return [];
  }

  if (Array.isArray(locationsJson)) {
    return locationsJson
      .map((location) => String(location || '').trim())
      .filter(Boolean);
  }

  if (typeof locationsJson === 'string') {
    try {
      const parsed = JSON.parse(locationsJson);
      if (Array.isArray(parsed)) {
        return parsed
          .map((location) => String(location || '').trim())
          .filter(Boolean);
      }
    } catch (_error) {
      return [];
    }
  }

  return [];
}

async function listUsers({ db, page = 1, limit = 20 }) {
  const usersPage = Number(page);
  const usersLimit = Number(limit);

  if (!Number.isInteger(usersPage) || usersPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(usersLimit) || usersLimit <= 0 || usersLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const skip = (usersPage - 1) * usersLimit;
  const activeFilter = {
    status: 'ACTIVE',
    isActive: true
  };
  const [total, users] = await Promise.all([
    db.user.count({ where: activeFilter }),
    db.user.findMany({
      where: activeFilter,
      skip,
      take: usersLimit,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        roleCode: true,
        status: true,
        isActive: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        title: true,
        phoneNumber: true,
        country: true,
        timezone: true,
        dateFormat: true,
        createdAt: true,
        updatedAt: true
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / usersLimit));
  const hasPrev = usersPage > 1;
  const hasNext = usersPage < totalPages;

  return {
    users: users.map(mapUserSummary),
    pagination: {
      page: usersPage,
      limit: usersLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? usersPage - 1 : null,
      nextPage: hasNext ? usersPage + 1 : null
    }
  };
}

async function listPendingInvitations({ db }) {
  const rows = await db.$queryRaw`
    SELECT
      ui.id,
      ui.email,
      ui.role_code,
      ui.locations_json,
      ui.status,
      ui.created_at,
      ui.updated_at,
      ui.sent_at,
      ui.expires_at,
      inviter.first_name AS invited_by_first_name,
      inviter.last_name AS invited_by_last_name,
      inviter.email AS invited_by_email
    FROM user_invitations ui
    LEFT JOIN users inviter ON inviter.id = ui.invited_by
    WHERE ui.status = 'PENDING'
      AND ui.expires_at > NOW()
    ORDER BY ui.id DESC
  `;

  const invitations = rows.map((row) => {
    const invitedByName = [row.invited_by_first_name, row.invited_by_last_name]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      id: Number(row.id),
      email: String(row.email || '').trim(),
      role: String(row.role_code || '').trim().toUpperCase(),
      locations: parseInvitationLocations(row.locations_json),
      status: String(row.status || '').trim().toUpperCase(),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sentAt: row.sent_at,
      expiresAt: row.expires_at,
      invitedBy: invitedByName || String(row.invited_by_email || '').trim() || null
    };
  });

  return {
    invitations
  };
}

async function listActivityLogs({
  db,
  page = 1,
  limit = 20,
  actorUserId
}) {
  const activityPage = Number(page);
  const activityLimit = Number(limit);

  if (!Number.isInteger(activityPage) || activityPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(activityLimit) || activityLimit <= 0 || activityLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const where = {};
  if (actorUserId !== undefined && actorUserId !== null && actorUserId !== '') {
    const parsedActorId = Number(actorUserId);
    if (!Number.isInteger(parsedActorId) || parsedActorId <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'actorUserId must be a positive integer.');
    }
    where.actorUserId = BigInt(parsedActorId);
  }

  const skip = (activityPage - 1) * activityLimit;
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      skip,
      take: activityLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / activityLimit));
  const hasPrev = activityPage > 1;
  const hasNext = activityPage < totalPages;

  const activityLogs = logs.map((log) => {
    const actorName = [log.actor?.firstName, log.actor?.lastName]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      id: Number(log.id),
      actorUserId: log.actorUserId ? Number(log.actorUserId) : null,
      actor: log.actor
        ? {
          id: Number(log.actor.id),
          email: log.actor.email,
          firstName: log.actor.firstName ?? null,
          lastName: log.actor.lastName ?? null,
          name: actorName || log.actor.email
        }
        : null,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId ?? null,
      requestId: log.requestId ?? null,
      ipAddress: log.ipAddress ?? null,
      userAgent: log.userAgent ?? null,
      metadata: log.metadata ?? null,
      createdAt: log.createdAt
    };
  });

  return {
    activityLogs,
    pagination: {
      page: activityPage,
      limit: activityLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? activityPage - 1 : null,
      nextPage: hasNext ? activityPage + 1 : null
    }
  };
}

async function createUser({ db, actorUserId, payload }) {
  const email = String(payload.email || '').toLowerCase().trim();
  const password = payload.password;
  const role = normalizeRole(payload.role || 'GUEST');

  if (!email || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email and password are required.');
  }

  if (!ALLOWED_ROLES.has(role)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid role value.');
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        roleCode: role,
        firstName: payload.firstName || null,
        lastName: payload.lastName || null,
        status: payload.status || 'ACTIVE',
        isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
        createdBy: BigInt(actorUserId)
      },
      select: {
        id: true,
        email: true,
        roleCode: true,
        status: true,
        isActive: true
      }
    });

    return {
      id: Number(user.id),
      email: user.email,
      role: user.roleCode,
      status: user.status,
      isActive: user.isActive
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
    }
    throw err;
  }
}

async function updateUser({ db, userId, payload }) {
  const patch = {};

  if (payload.email !== undefined) {
    patch.email = String(payload.email).toLowerCase().trim();
  }
  if (payload.role !== undefined) {
    const normalizedRole = normalizeRole(payload.role);
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid role value.');
    }
    patch.roleCode = normalizedRole;
  }
  if (payload.status !== undefined) {
    if (!ALLOWED_STATUS.has(payload.status)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid status value.');
    }
    patch.status = payload.status;
  }
  if (payload.firstName !== undefined) {
    patch.firstName = payload.firstName;
  }
  if (payload.lastName !== undefined) {
    patch.lastName = payload.lastName;
  }
  if (payload.isActive !== undefined) {
    patch.isActive = Boolean(payload.isActive);
  }

  const keys = Object.keys(patch);
  if (!keys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported fields to update.');
  }

  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: patch
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
    }
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }
}

async function updateOwnProfile({ db, userId, payload }) {
  const patch = {};
  let nextAvatarUrl = null;

  if (payload.email !== undefined) {
    patch.email = String(payload.email).toLowerCase().trim();
  }
  if (payload.firstName !== undefined) {
    patch.firstName = payload.firstName;
  }
  if (payload.lastName !== undefined) {
    patch.lastName = payload.lastName;
  }
  if (payload.title !== undefined) {
    patch.title = payload.title;
  }
  if (payload.phoneNumber !== undefined) {
    patch.phoneNumber = payload.phoneNumber;
  }
  if (payload.country !== undefined) {
    patch.country = payload.country;
  }
  if (payload.timezone !== undefined) {
    patch.timezone = payload.timezone;
  }
  if (payload.dateFormat !== undefined) {
    patch.dateFormat = payload.dateFormat;
  }
  if (payload.filePath) {
    const normalizedPath = String(payload.filePath).replace(/\\/g, '/');
    const publicPrefix = `${process.cwd().replace(/\\/g, '/')}/public/`;
    const relative = normalizedPath.startsWith(publicPrefix)
      ? normalizedPath.slice(publicPrefix.length)
      : normalizedPath.split('/public/')[1];

    if (!relative) {
      throw new AppError(500, 'UPLOAD_ERROR', 'Could not determine uploaded file path.');
    }

    nextAvatarUrl = `/${relative}`;
    patch.avatarUrl = nextAvatarUrl;
  }

  const keys = Object.keys(patch);
  if (!keys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported fields to update.');
  }

  try {
    const previous = nextAvatarUrl
      ? await db.user.findUnique({
        where: { id: BigInt(userId) },
        select: { avatarUrl: true }
      })
      : null;
    const previousAvatarUrl = previous?.avatarUrl || null;

    await db.user.update({
      where: { id: BigInt(userId) },
      data: patch
    });

    if (nextAvatarUrl && previousAvatarUrl && previousAvatarUrl !== nextAvatarUrl && previousAvatarUrl.startsWith('/uploads/avatars/')) {
      const oldFilePath = path.join(process.cwd(), 'public', previousAvatarUrl.replace(/^\//, ''));
      fs.unlink(oldFilePath).catch(() => {});
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists.');
    }
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  return { success: true };
}

async function updateUserRole({ db, userId, role }) {
  const nextRole = normalizeRole(role);
  if (!ALLOWED_ROLES.has(nextRole)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid role value.');
  }

  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: { roleCode: nextRole }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  return { success: true };
}

async function updatePassword({ db, userId, newPassword }) {
  if (!newPassword || String(newPassword).length < 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 10 characters.');
  }

  const passwordHash = await hashPassword(newPassword);

  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: {
        passwordHash,
        passwordChangedAt: new Date()
      }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  await db.refreshToken.updateMany({
    where: { userId: BigInt(userId), isRevoked: false },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'PASSWORD_CHANGED'
    }
  });
}

async function changeOwnPassword({ db, userId, currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'currentPassword, newPassword and confirmPassword are required.'
    );
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'newPassword and confirmPassword must match.');
  }

  const user = await db.user.findUnique({
    where: { id: BigInt(userId) },
    select: { passwordHash: true }
  });

  if (!user || !user.passwordHash) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }

  const validCurrentPassword = await verifyPassword(currentPassword, user.passwordHash);
  if (!validCurrentPassword) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  await updatePassword({ db, userId, newPassword });
  return { success: true };
}

async function updateAvatar({ db, userId, filePath }) {
  if (!filePath) {
    throw new AppError(400, 'VALIDATION_ERROR', 'avatar file is required.');
  }

  const normalizedPath = String(filePath).replace(/\\/g, '/');
  const publicPrefix = `${process.cwd().replace(/\\/g, '/')}/public/`;
  const relative = normalizedPath.startsWith(publicPrefix)
    ? normalizedPath.slice(publicPrefix.length)
    : normalizedPath.split('/public/')[1];

  if (!relative) {
    throw new AppError(500, 'UPLOAD_ERROR', 'Could not determine uploaded file path.');
  }

  const avatarUrl = `/${relative}`;

  try {
    const previous = await db.user.findUnique({
      where: { id: BigInt(userId) },
      select: { avatarUrl: true }
    });
    const previousAvatarUrl = previous?.avatarUrl || null;

    const updated = await db.user.update({
      where: { id: BigInt(userId) },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        roleCode: true,
        status: true,
        isActive: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        title: true,
        phoneNumber: true,
        country: true,
        timezone: true,
        dateFormat: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (previousAvatarUrl && previousAvatarUrl !== avatarUrl && previousAvatarUrl.startsWith('/uploads/avatars/')) {
      const oldFilePath = path.join(process.cwd(), 'public', previousAvatarUrl.replace(/^\//, ''));
      fs.unlink(oldFilePath).catch(() => {});
    }

    return mapUserSummary(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }
}

async function softDeleteUser({ db, userId }) {
  try {
    await db.user.update({
      where: { id: BigInt(userId) },
      data: {
        status: 'DELETED',
        isActive: false
      }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }
    throw err;
  }

  await db.refreshToken.updateMany({
    where: { userId: BigInt(userId), isRevoked: false },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'USER_SOFT_DELETED'
    }
  });

  return { success: true };
}

function normalizeMembers(memberList) {
  const mapped = memberList
    .map((member) => ({
      email: String(member?.email || '').trim().toLowerCase(),
      role: normalizeRole(member?.role || 'GUEST')
    }))
    .filter((member) => member.email);

  // Keep first occurrence for duplicate emails.
  const unique = [];
  const seen = new Set();
  for (const member of mapped) {
    if (seen.has(member.email)) continue;
    seen.add(member.email);
    unique.push(member);
  }
  return unique;
}

function normalizeRole(roleValue) {
  const cleaned = String(roleValue || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (cleaned === 'TEAM_MEMBER' || cleaned === 'TEAMMEMBER') return 'TEAM_MEMBER';
  if (cleaned === 'MEMBER') return 'TEAM_MEMBER';
  if (cleaned === 'ADMIN') return 'ADMIN';
  if (cleaned === 'GUEST') return 'GUEST';
  return cleaned;
}

function normalizeLocations(locationList) {
  const cleaned = locationList
    .map((location) => String(location || '').trim())
    .filter(Boolean);

  return [...new Set(cleaned)];
}

async function inviteUsers({ db, env, actorUserId, payload }) {
  const requestedByUserIdRaw = payload.requestedByUserId;
  const requestedByUserId = requestedByUserIdRaw === undefined
    ? actorUserId
    : Number(requestedByUserIdRaw);

  if (!Number.isFinite(requestedByUserId) || requestedByUserId <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'requestedByUserId must be a positive number.');
  }

  if (requestedByUserId !== actorUserId) {
    throw new AppError(403, 'FORBIDDEN', 'requestedByUserId must match the authenticated user.');
  }

  const members = normalizeMembers(Array.isArray(payload.members) ? payload.members : []);
  const locations = normalizeLocations(Array.isArray(payload.locations) ? payload.locations : []);

  if (!members.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'members must be a non-empty array.');
  }

  if (!env.invite.baseUrl) {
    throw new AppError(500, 'INVITE_CONFIG_ERROR', 'INVITE_BASE_URL (or APP_BASE_URL) is required.');
  }

  const invalidRole = members.find((member) => !ALLOWED_ROLES.has(member.role));
  if (invalidRole) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid role value for ${invalidRole.email}.`);
  }

  const emails = members.map((member) => member.email);
  const existingUsers = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, status: true }
  });
  const existingInvitations = await db.userInvitation.findMany({
    where: {
      email: { in: emails },
      status: { in: ['PENDING', 'ACCEPTED'] }
    },
    select: {
      email: true,
      status: true,
      expiresAt: true
    },
    orderBy: { id: 'desc' }
  });

  for (const user of existingUsers) {
    const status = String(user.status || '').trim().toUpperCase();

    if (status !== 'DELETED') {
      // eslint-disable-next-line no-continue
      continue;
    }

    await db.user.update({
      where: { id: BigInt(user.id) },
      data: {
        email: buildArchivedUserEmail(user.email, user.id)
      }
    });
  }

  const blockingExistingSet = new Set(
    existingUsers
      .filter((user) => String(user.status || '').trim().toUpperCase() !== 'DELETED')
      .map((user) => user.email.toLowerCase())
  );
  const invitationStateByEmail = new Map();
  for (const row of existingInvitations) {
    const key = row.email.toLowerCase();
    const prev = invitationStateByEmail.get(key) || {
      hasAccepted: false,
      hasPendingValid: false
    };
    if (row.status === 'ACCEPTED') {
      prev.hasAccepted = true;
    }
    if (row.status === 'PENDING') {
      const expiresAt = new Date(row.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()) {
        prev.hasPendingValid = true;
      }
    }
    invitationStateByEmail.set(key, prev);
  }
  const results = [];

  for (const member of members) {
    const { email, role } = member;

    if (!EMAIL_REGEX.test(email)) {
      results.push({ email, status: 'SKIPPED_INVALID_EMAIL' });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (blockingExistingSet.has(email)) {
      results.push({ email, status: 'SKIPPED_USER_EXISTS' });
      // eslint-disable-next-line no-continue
      continue;
    }
    const inviteState = invitationStateByEmail.get(email);
    if (inviteState?.hasPendingValid) {
      results.push({ email, status: 'SKIPPED_PENDING_INVITATION_EXISTS' });
      // eslint-disable-next-line no-continue
      continue;
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + env.invite.expiresInHours * 60 * 60 * 1000);

    await db.$executeRaw`
      INSERT INTO user_invitations
      (email, role_code, locations_json, token_hash, invited_by, status, expires_at, updated_at)
      VALUES
      (${email}, ${role}, ${JSON.stringify(locations)}, ${tokenHash}, ${BigInt(requestedByUserId)}, 'PENDING', ${expiresAt}, NOW())
    `;

    const inviteUrl = `${env.invite.baseUrl.replace(/\/$/, '')}?token=${encodeURIComponent(token)}`;

    try {
      await sendInviteEmail({
        env,
        to: email,
        inviteUrl,
        role
      });

      await db.$executeRaw`
        UPDATE user_invitations
        SET sent_at = NOW(), updated_at = NOW()
        WHERE token_hash = ${tokenHash}
      `;

      results.push({ email, role, status: 'INVITED' });
    } catch (error) {
      await db.$executeRaw`
        UPDATE user_invitations
        SET status = 'FAILED', updated_at = NOW()
        WHERE token_hash = ${tokenHash}
      `;
      results.push({ email, role, status: 'FAILED_TO_SEND' });
    }
  }

  const summary = results.reduce(
    (acc, row) => {
      if (row.status === 'INVITED') acc.invited += 1;
      else if (row.status === 'FAILED_TO_SEND') acc.failed += 1;
      else acc.skipped += 1;
      return acc;
    },
    { invited: 0, failed: 0, skipped: 0 }
  );

  return { summary, locations, results };
}

async function getPermissionsSettings({ db }) {
  const rows = await db.$queryRaw`
    SELECT value_json
    FROM app_settings
    WHERE setting_key = ${PERMISSIONS_SETTINGS_KEY}
    LIMIT 1
  `;
  const value = Array.isArray(rows) && rows.length > 0 ? rows[0].value_json : null;
  const settings = parseStoredPermissionsValue(value);

  if (!value) {
    await db.$executeRaw`
      INSERT INTO app_settings (setting_key, value_json, created_at, updated_at)
      VALUES (${PERMISSIONS_SETTINGS_KEY}, ${JSON.stringify(settings)}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
    `;
  }

  return settings;
}

async function updatePermissionsSettings({ db, payload }) {
  const settings = normalizePermissionsPayload(payload);

  await db.$executeRaw`
    INSERT INTO app_settings (setting_key, value_json, created_at, updated_at)
    VALUES (${PERMISSIONS_SETTINGS_KEY}, ${JSON.stringify(settings)}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
  `;

  return { success: true, settings };
}

module.exports = {
  listUsers,
  listActivityLogs,
  listPendingInvitations,
  createUser,
  updateUser,
  updateOwnProfile,
  updateUserRole,
  updatePassword,
  changeOwnPassword,
  updateAvatar,
  softDeleteUser,
  inviteUsers,
  getPermissionsSettings,
  updatePermissionsSettings
};
