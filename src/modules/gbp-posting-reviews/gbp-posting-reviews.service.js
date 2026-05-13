const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { AppError } = require('../../lib/errors');
const { sendGbpPostingReviewOtpEmail } = require('../../lib/mailer');

const REVIEW_SESSION_TYPE = 'gbp_posting_review';
const EDITABLE_FIELDS = [
  ['postContent', 'Post Content'],
  ['images', 'Images'],
  ['buttonType', 'Button'],
];

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function parseUnsignedBigInt(value, fieldName) {
  const normalized = asString(value).trim();

  if (!/^\d+$/.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }

  return BigInt(normalized);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function encryptionKey(env) {
  return crypto
    .createHash('sha256')
    .update(String(env.jwt.accessTokenSecret))
    .digest();
}

function encryptToken(token, env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptToken(ciphertext, env) {
  const [ivRaw, tagRaw, encryptedRaw] = String(ciphertext || '').split('.');

  if (!ivRaw || !tagRaw || !encryptedRaw) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(env),
      Buffer.from(ivRaw, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function normalizeEmail(value) {
  return asString(value).trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toPublicPath(token) {
  return `/gbp-posting-review/${token}`;
}

function signReviewSession({ env, link, reviewer }) {
  return jwt.sign(
    {
      typ: REVIEW_SESSION_TYPE,
      linkId: String(link.id),
      email: reviewer.email,
      name: reviewer.fullName,
    },
    env.jwt.accessTokenSecret,
    {
      algorithm: 'HS256',
      audience: env.jwt.audience,
      expiresIn: `${env.gbpPostingReview.sessionExpiresHours}h`,
      issuer: env.jwt.issuer,
    },
  );
}

function verifyReviewSessionToken(token, env) {
  try {
    const decoded = jwt.verify(token, env.jwt.accessTokenSecret, {
      algorithms: ['HS256'],
      audience: env.jwt.audience,
      issuer: env.jwt.issuer,
    });

    if (decoded.typ !== REVIEW_SESSION_TYPE) {
      throw new Error('Invalid token type.');
    }

    return decoded;
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired review session.');
  }
}

function mapActivity(record) {
  return {
    action: record.action,
    actorEmail: record.actorEmail,
    actorName: record.actorName,
    actorType: record.actorType,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    fieldName: record.fieldName,
    id: String(record.id),
    metadata: record.metadataJson || null,
    newValue: record.newValue,
    oldValue: record.oldValue,
  };
}

function mapComment(record) {
  return {
    authorEmail: record.authorEmail,
    authorName: record.authorName,
    comment: record.comment,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    id: String(record.id),
    source: record.source,
  };
}

function mapVersion(record) {
  return {
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    createdByEmail: record.createdByEmail,
    createdByName: record.createdByName,
    createdByType: record.createdByType,
    id: String(record.id),
    snapshot: record.snapshotJson,
    source: record.source,
  };
}

function mapLink(record, env) {
  if (!record) {
    return null;
  }

  const token = decryptToken(record.tokenCiphertext, env);

  return {
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    disabledAt: record.disabledAt ? record.disabledAt.toISOString() : null,
    enabled: Boolean(record.enabled),
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt.toISOString() : String(record.expiresAt),
    id: String(record.id),
    publicPath: token ? toPublicPath(token) : null,
  };
}

function snapshotPosting(posting) {
  return {
    keyword: posting?.keyword ?? null,
    audience: posting?.audience ?? null,
    contentType: posting?.contentType ?? null,
    buttonType: posting?.buttonType ?? null,
    description: posting?.description ?? null,
    postContent: posting?.postContent ?? null,
    images: Array.isArray(posting?.images) ? posting.images : [],
    liveLink: posting?.liveLink ?? null,
    status: posting?.status ?? null,
  };
}

async function getPostingRecord({ db, postingId }) {
  const record = await db.clientGbpPosting.findUnique({
    where: { id: postingId },
    include: {
      client: {
        select: {
          businessName: true,
          clientName: true,
          discordChannel: true,
          id: true,
        },
      },
    },
  });

  if (!record) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting not found.');
  }

  return record;
}

async function createActivity({
  action,
  actor,
  clientId,
  db,
  fieldName = null,
  metadata = null,
  newValue = null,
  oldValue = null,
  postingId,
}) {
  let actorEmail = actor.email || null;
  let actorName = actor.name || null;

  if ((!actorEmail || !actorName) && actor.userId) {
    const user = await db.user.findUnique({
      select: {
        email: true,
        firstName: true,
        lastName: true,
      },
      where: { id: BigInt(actor.userId) },
    });

    if (user) {
      actorEmail = actorEmail || user.email || null;
      actorName =
        actorName ||
        [user.firstName, user.lastName]
          .map((value) => asString(value).trim())
          .filter(Boolean)
          .join(' ') ||
        null;
    }
  }

  return db.clientGbpPostingEditActivity.create({
    data: {
      action,
      actorEmail,
      actorName,
      actorType: actor.type,
      actorUserId: actor.userId ? BigInt(actor.userId) : null,
      clientId,
      fieldName,
      metadataJson: metadata,
      newValue,
      oldValue,
      postingId,
    },
  });
}

async function createVersion({
  actor,
  clientId,
  db,
  posting,
  postingId,
  source,
}) {
  return db.clientGbpPostingVersion.create({
    data: {
      clientId,
      createdByEmail: actor.email || null,
      createdByName: actor.name || null,
      createdByType: actor.type,
      createdByUserId: actor.userId ? BigInt(actor.userId) : null,
      postingId,
      snapshotJson: snapshotPosting(posting),
      source,
    },
  });
}

async function getDashboardState({ db, env, query }) {
  const postingId = parseUnsignedBigInt(query.postingId, 'postingId');

  const posting = await getPostingRecord({ db, postingId });

  const [link, activities, versions, comments] = await Promise.all([
    db.clientGbpPostingReviewLink.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        enabled: true,
        postingId,
      },
    }),
    db.clientGbpPostingEditActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      where: { postingId },
    }),
    db.clientGbpPostingVersion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      where: { postingId },
    }),
    db.clientGbpPostingComment.findMany({
      orderBy: { createdAt: 'asc' },
      where: { postingId, source: { not: 'INTERNAL' } },
    }),
  ]);

  return {
    activities: activities.map(mapActivity),
    comments: comments.map(mapComment),
    link: mapLink(link, env),
    posting: snapshotPosting(posting),
    versions: versions.map(mapVersion),
  };
}

async function enableLink({ actorUserId, db, env, payload }) {
  const postingId = parseUnsignedBigInt(payload.postingId, 'postingId');
  const posting = await getPostingRecord({ db, postingId });
  const existing = await db.clientGbpPostingReviewLink.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      enabled: true,
      expiresAt: { gt: new Date() },
      postingId,
    },
  });

  if (existing) {
    return { link: mapLink(existing, env) };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const actor = {
    email: null,
    name: null,
    type: 'USER',
    userId: actorUserId,
  };
  const link = await db.clientGbpPostingReviewLink.create({
    data: {
      clientId: posting.clientId,
      createdBy: actorUserId ? BigInt(actorUserId) : null,
      expiresAt: addDays(new Date(), env.gbpPostingReview.linkExpiresDays),
      postingId,
      tokenCiphertext: encryptToken(token, env),
      tokenHash: hashValue(token),
    },
  });

  await createVersion({
    actor,
    clientId: posting.clientId,
    db,
    posting,
    postingId,
    source: 'PUBLIC_LINK_ENABLED',
  });
  await createActivity({
    action: 'PUBLIC_LINK_ENABLED',
    actor,
    clientId: posting.clientId,
    db,
    metadata: { expiresAt: link.expiresAt.toISOString() },
    postingId,
  });

  return { link: mapLink(link, env) };
}

async function disableLink({ actorUserId, db, query }) {
  const postingId = parseUnsignedBigInt(query.postingId, 'postingId');
  const posting = await getPostingRecord({ db, postingId });
  const link = await db.clientGbpPostingReviewLink.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      enabled: true,
      postingId,
    },
  });

  if (!link) {
    return { success: true };
  }

  await db.clientGbpPostingReviewLink.update({
    data: {
      disabledAt: new Date(),
      enabled: false,
    },
    where: { id: link.id },
  });

  await createActivity({
    action: 'PUBLIC_LINK_DISABLED',
    actor: { type: 'USER', userId: actorUserId },
    clientId: posting.clientId,
    db,
    postingId,
  });

  return { success: true };
}

async function sendLinkToClientReview({ actorUserId, db, env, payload }) {
  const postingId = parseUnsignedBigInt(payload.postingId, 'postingId');
  const publicUrl = asString(payload.publicUrl).trim();

  if (!publicUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Public review link is required.');
  }

  const botToken = env?.integrations?.discord?.botToken;
  if (!botToken) {
    throw new AppError(
      500,
      'CONFIGURATION_ERROR',
      'Discord bot token is not configured.'
    );
  }

  const posting = await getPostingRecord({ db, postingId });
  const link = await db.clientGbpPostingReviewLink.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      enabled: true,
      expiresAt: { gt: new Date() },
      postingId,
    },
  });

  if (!link) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Public review link must be enabled before sending to client.'
    );
  }

  const channelId = asString(posting.client?.discordChannel).trim();
  if (!channelId) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Client Discord channel is not configured.'
    );
  }

  if (!/^\d{15,25}$/.test(channelId)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Client Discord channel must be a valid channel ID.'
    );
  }

  const postingTitle = asString(posting.keyword).trim() || 'GBP Posting';
  const clientName = asString(posting.client?.clientName || posting.client?.businessName).trim();
  const messageLines = [
    'Please review the GBP posting.',
    postingTitle ? `Posting: ${postingTitle}` : null,
    clientName ? `Client: ${clientName}` : null,
    publicUrl,
  ].filter(Boolean);
  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        content: messageLines.join('\n'),
      }),
    }
  );

  if (!response.ok) {
    let details = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }

    throw new AppError(
      502,
      'UPSTREAM_API_ERROR',
      'Discord review link message failed.',
      {
        provider: 'DISCORD',
        status: response.status,
        details,
      }
    );
  }

  await createActivity({
    action: 'PUBLIC_LINK_SENT_TO_CLIENT',
    actor: { type: 'USER', userId: actorUserId },
    clientId: posting.clientId,
    db,
    metadata: { channelId, publicUrl },
    postingId,
  });

  return { sent: true };
}

async function findActiveLinkByToken({ db, token }) {
  const link = await db.clientGbpPostingReviewLink.findUnique({
    where: { tokenHash: hashValue(token) },
  });

  if (!link || !link.enabled || link.expiresAt <= new Date()) {
    throw new AppError(404, 'NOT_FOUND', 'This review link is unavailable or expired.');
  }

  return link;
}

async function publicStatus({ db, token }) {
  const link = await findActiveLinkByToken({ db, token });
  const posting = await getPostingRecord({ db, postingId: link.postingId });

  return {
    postingTitle: asString(posting.keyword) || 'GBP Posting',
    clientName: posting.client?.businessName || posting.client?.clientName || 'Client',
    expiresAt: link.expiresAt.toISOString(),
    requiresOtp: true,
  };
}

async function sendOtp({ db, env, payload, token }) {
  const fullName = asString(payload.fullName).trim();
  const email = normalizeEmail(payload.email);

  if (!fullName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Full name is required.');
  }

  if (!email || !validateEmail(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid email is required.');
  }

  const link = await findActiveLinkByToken({ db, token });
  const recentCount = await db.clientGbpPostingReviewOtp.count({
    where: {
      createdAt: { gt: addMinutes(new Date(), -10) },
      email,
      reviewLinkId: link.id,
    },
  });

  if (recentCount >= 3) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many verification codes requested. Please wait and try again.');
  }

  const otp = String(crypto.randomInt(100000, 1000000));

  await db.clientGbpPostingReviewOtp.create({
    data: {
      email,
      expiresAt: addMinutes(new Date(), env.gbpPostingReview.otpExpiresMinutes),
      fullName,
      otpHash: hashValue(`${link.id}:${email}:${otp}`),
      reviewLinkId: link.id,
    },
  });

  await sendGbpPostingReviewOtpEmail({ email, env, fullName, otp, to: email });

  return { success: true };
}

async function verifyOtp({ db, env, payload, token }) {
  const email = normalizeEmail(payload.email);
  const otp = asString(payload.otp).trim();

  if (!email || !validateEmail(email) || !/^\d{6}$/.test(otp)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid verification details.');
  }

  const link = await findActiveLinkByToken({ db, token });
  const otpRecord = await db.clientGbpPostingReviewOtp.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      email,
      expiresAt: { gt: new Date() },
      reviewLinkId: link.id,
      usedAt: null,
    },
  });

  if (!otpRecord || otpRecord.attemptCount >= 5) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired verification code.');
  }

  const expectedHash = hashValue(`${link.id}:${email}:${otp}`);

  if (otpRecord.otpHash !== expectedHash) {
    await db.clientGbpPostingReviewOtp.update({
      data: { attemptCount: { increment: 1 } },
      where: { id: otpRecord.id },
    });

    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired verification code.');
  }

  await db.clientGbpPostingReviewOtp.update({
    data: { usedAt: new Date() },
    where: { id: otpRecord.id },
  });

  return {
    reviewSessionToken: signReviewSession({
      env,
      link,
      reviewer: {
        email,
        fullName: otpRecord.fullName,
      },
    }),
    reviewer: {
      email,
      fullName: otpRecord.fullName,
    },
    sessionExpiresAt: addHours(new Date(), env.gbpPostingReview.sessionExpiresHours).toISOString(),
  };
}

async function requireReviewSession({ db, env, reviewSessionToken, token }) {
  const link = await findActiveLinkByToken({ db, token });
  const session = verifyReviewSessionToken(reviewSessionToken, env);

  if (String(link.id) !== String(session.linkId)) {
    throw new AppError(403, 'FORBIDDEN', 'Review session does not match this link.');
  }

  return {
    link,
    reviewer: {
      email: session.email,
      fullName: session.name,
    },
  };
}

async function getPublicContent({ db, env, reviewSessionToken, token }) {
  const { link, reviewer } = await requireReviewSession({
    db,
    env,
    reviewSessionToken,
    token,
  });
  const posting = await getPostingRecord({ db, postingId: link.postingId });
  const [comments, activities] = await Promise.all([
    db.clientGbpPostingComment.findMany({
      orderBy: { createdAt: 'asc' },
      where: { postingId: link.postingId, source: { not: 'INTERNAL' } },
    }),
    db.clientGbpPostingEditActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      where: { postingId: link.postingId },
    }),
  ]);

  return {
    posting: snapshotPosting(posting),
    clientName: posting.client?.businessName || posting.client?.clientName || 'Client',
    comments: comments.map(mapComment),
    history: activities.map(mapActivity),
    reviewer,
  };
}

function normalizePublicUpdatePayload(payload) {
  const source = typeof payload === 'object' && payload !== null ? payload : {};
  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(source, 'postContent')) {
    normalized.postContent = asString(source.postContent).trim();
  }

  if (Object.prototype.hasOwnProperty.call(source, 'images')) {
    if (Array.isArray(source.images)) {
      normalized.images = source.images.filter((value) => typeof value === 'string' && value.trim().length > 0);
    } else if (source.images === null) {
      normalized.images = [];
    }
  }

  if (Object.prototype.hasOwnProperty.call(source, 'buttonType')) {
    const trimmed = asString(source.buttonType).trim();

    normalized.buttonType = trimmed.length > 0 ? trimmed : null;
  }

  return normalized;
}

function stringifyComparable(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

async function savePublicContent({ db, env, payload, reviewSessionToken, token }) {
  const { link, reviewer } = await requireReviewSession({
    db,
    env,
    reviewSessionToken,
    token,
  });
  const posting = await getPostingRecord({ db, postingId: link.postingId });
  const patch = normalizePublicUpdatePayload(payload);
  const actor = {
    email: reviewer.email,
    name: reviewer.fullName,
    type: 'PUBLIC_REVIEWER',
  };

  const updated = await db.clientGbpPosting.update({
    where: { id: posting.id },
    data: {
      ...(Object.prototype.hasOwnProperty.call(patch, 'postContent')
        ? { postContent: patch.postContent, description: patch.postContent }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'images')
        ? { images: patch.images }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'buttonType')
        ? { buttonType: patch.buttonType }
        : {}),
    },
  });

  await createVersion({
    actor,
    clientId: posting.clientId,
    db,
    posting: { ...posting, ...updated },
    postingId: posting.id,
    source: 'PUBLIC_EDIT',
  });

  for (const [field, label] of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const oldValue = stringifyComparable(posting[field]);
    const newValue = stringifyComparable(updated[field]);

    if (oldValue === newValue) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await createActivity({
      action: 'FIELD_UPDATED',
      actor,
      clientId: posting.clientId,
      db,
      fieldName: label,
      newValue,
      oldValue,
      postingId: posting.id,
    });
  }

  return { posting: snapshotPosting({ ...posting, ...updated }), success: true };
}

async function addPublicComment({ db, env, payload, reviewSessionToken, token }) {
  const comment = asString(payload.comment).trim();

  if (!comment) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Comment is required.');
  }

  const { link, reviewer } = await requireReviewSession({
    db,
    env,
    reviewSessionToken,
    token,
  });
  const posting = await getPostingRecord({ db, postingId: link.postingId });
  const created = await db.clientGbpPostingComment.create({
    data: {
      authorEmail: reviewer.email,
      authorName: reviewer.fullName,
      comment,
      postingId: posting.id,
      reviewLinkId: link.id,
      source: 'PUBLIC_REVIEW',
    },
  });

  await createActivity({
    action: 'COMMENT_ADDED',
    actor: {
      email: reviewer.email,
      name: reviewer.fullName,
      type: 'PUBLIC_REVIEWER',
    },
    clientId: posting.clientId,
    db,
    metadata: { commentId: String(created.id) },
    newValue: comment,
    postingId: posting.id,
  });

  return { comment: mapComment(created) };
}

async function deletePublicComment({ commentId, db, env, reviewSessionToken, token }) {
  const parsedCommentId = parseUnsignedBigInt(commentId, 'Comment ID');
  const { link, reviewer } = await requireReviewSession({
    db,
    env,
    reviewSessionToken,
    token,
  });
  const comment = await db.clientGbpPostingComment.findFirst({
    where: {
      authorEmail: reviewer.email,
      id: parsedCommentId,
      reviewLinkId: link.id,
      source: 'PUBLIC_REVIEW',
    },
  });

  if (!comment) {
    throw new AppError(404, 'NOT_FOUND', 'Comment was not found.');
  }

  const posting = await getPostingRecord({ db, postingId: comment.postingId });

  await db.clientGbpPostingComment.delete({
    where: { id: parsedCommentId },
  });

  await createActivity({
    action: 'COMMENT_DELETED',
    actor: {
      email: reviewer.email,
      name: reviewer.fullName,
      type: 'PUBLIC_REVIEWER',
    },
    clientId: posting.clientId,
    db,
    metadata: { commentId: String(comment.id) },
    oldValue: comment.comment,
    postingId: comment.postingId,
  });

  return { success: true };
}

module.exports = {
  addPublicComment,
  deletePublicComment,
  disableLink,
  enableLink,
  getDashboardState,
  getPublicContent,
  publicStatus,
  savePublicContent,
  sendLinkToClientReview,
  sendOtp,
  verifyOtp,
};
