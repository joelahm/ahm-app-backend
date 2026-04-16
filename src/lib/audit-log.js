function resolveRequestId(req) {
  const raw =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    req.id;

  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw.trim();
  return value || null;
}

function resolveIpAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || null;
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

async function writeAuditLog({
  db,
  req,
  actorUserId,
  action,
  resourceType,
  resourceId,
  metadata
}) {
  try {
    await db.auditLog.create({
      data: {
        actorUserId: actorUserId ? BigInt(actorUserId) : null,
        action: toNullableString(action) || 'UNKNOWN_ACTION',
        resourceType: toNullableString(resourceType) || 'UNKNOWN_RESOURCE',
        resourceId: toNullableString(resourceId),
        requestId: resolveRequestId(req),
        ipAddress: toNullableString(resolveIpAddress(req)),
        userAgent: toNullableString(req.get('user-agent')),
        metadata: metadata ?? {}
      }
    });
  } catch (_error) {
    // Avoid breaking primary requests due to telemetry/audit persistence issues.
  }
}

module.exports = { writeAuditLog };
