const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { AppError } = require('../../lib/errors');
const { sendWebsiteContentReviewOtpEmail } = require('../../lib/mailer');

const REVIEW_SESSION_TYPE = 'website_content_review';
const EDITABLE_FIELDS = [
  ['title', 'Article Title'],
  ['urlSlug', 'URL Slug'],
  ['metaTitle', 'Meta Title'],
  ['metaDescription', 'Meta Description'],
  ['generatedContent', 'Content'],
  ['featuredImage', 'Featured Image'],
  ['altTitle', 'Alt Title'],
  ['altDescription', 'Alt Description'],
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
  return `/website-content-review/${token}`;
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
      expiresIn: `${env.websiteContentReview.sessionExpiresHours}h`,
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

function snapshotKeyword(keyword) {
  return {
    altDescription: keyword?.altDescription ?? null,
    altTitle: keyword?.altTitle ?? null,
    contentType: keyword?.contentType ?? null,
    featuredImage: keyword?.featuredImage ?? null,
    generatedContent: keyword?.generatedContent ?? null,
    keyword: keyword?.keyword ?? null,
    metaDescription: keyword?.metaDescription ?? null,
    metaTitle: keyword?.metaTitle ?? null,
    title: keyword?.title ?? null,
    urlSlug: keyword?.urlSlug ?? null,
  };
}

function resolveKeyword(record, keywordId) {
  const keywords = Array.isArray(record?.keywordsJson) ? record.keywordsJson : [];
  const index = keywords.findIndex((item) => asString(item?.id).trim() === keywordId);

  if (index < 0) {
    throw new AppError(404, 'NOT_FOUND', 'Website content article not found.');
  }

  return { index, keyword: keywords[index], keywords };
}

async function getKeywordRecord({ db, listId, keywordId }) {
  const record = await db.keywordContentList.findUnique({
    where: { id: listId },
    select: {
      client: {
        select: {
          businessName: true,
          clientName: true,
          discordChannel: true,
          id: true,
        },
      },
      clientId: true,
      id: true,
      keywordsJson: true,
    },
  });

  if (!record) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword content list not found.');
  }

  const resolved = resolveKeyword(record, keywordId);

  return { ...resolved, record };
}

async function createActivity({
  action,
  actor,
  clientId,
  db,
  fieldName = null,
  keywordContentListId,
  keywordId,
  metadata = null,
  newValue = null,
  oldValue = null,
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

  return db.websiteContentEditActivity.create({
    data: {
      action,
      actorEmail,
      actorName,
      actorType: actor.type,
      actorUserId: actor.userId ? BigInt(actor.userId) : null,
      clientId,
      fieldName,
      keywordContentListId,
      keywordId,
      metadataJson: metadata,
      newValue,
      oldValue,
    },
  });
}

async function createVersion({
  actor,
  clientId,
  db,
  keyword,
  keywordContentListId,
  keywordId,
  source,
}) {
  return db.websiteContentVersion.create({
    data: {
      clientId,
      createdByEmail: actor.email || null,
      createdByName: actor.name || null,
      createdByType: actor.type,
      createdByUserId: actor.userId ? BigInt(actor.userId) : null,
      keywordContentListId,
      keywordId,
      snapshotJson: snapshotKeyword(keyword),
      source,
    },
  });
}

async function getDashboardState({ db, env, query }) {
  const listId = parseUnsignedBigInt(query.listId, 'listId');
  const keywordId = asString(query.keywordId).trim();

  if (!keywordId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywordId is required.');
  }

  await getKeywordRecord({ db, keywordId, listId });

  const [link, activities, versions, comments] = await Promise.all([
    db.websiteContentReviewLink.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        enabled: true,
        keywordContentListId: listId,
        keywordId,
      },
    }),
    db.websiteContentEditActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      where: { keywordContentListId: listId, keywordId },
    }),
    db.websiteContentVersion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      where: { keywordContentListId: listId, keywordId },
    }),
    db.websiteContentReviewComment.findMany({
      orderBy: { createdAt: 'asc' },
      where: { keywordContentListId: listId, keywordId },
    }),
  ]);

  return {
    activities: activities.map(mapActivity),
    comments: comments.map(mapComment),
    link: mapLink(link, env),
    versions: versions.map(mapVersion),
  };
}

async function enableLink({ actorUserId, db, env, payload }) {
  const listId = parseUnsignedBigInt(payload.listId, 'listId');
  const keywordId = asString(payload.keywordId).trim();

  if (!keywordId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywordId is required.');
  }

  const { keyword, record } = await getKeywordRecord({ db, keywordId, listId });
  const existing = await db.websiteContentReviewLink.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      enabled: true,
      expiresAt: { gt: new Date() },
      keywordContentListId: listId,
      keywordId,
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
  const link = await db.websiteContentReviewLink.create({
    data: {
      clientId: record.clientId,
      createdBy: actorUserId ? BigInt(actorUserId) : null,
      expiresAt: addDays(new Date(), env.websiteContentReview.linkExpiresDays),
      keywordContentListId: listId,
      keywordId,
      tokenCiphertext: encryptToken(token, env),
      tokenHash: hashValue(token),
    },
  });

  await createVersion({
    actor,
    clientId: record.clientId,
    db,
    keyword,
    keywordContentListId: listId,
    keywordId,
    source: 'PUBLIC_LINK_ENABLED',
  });
  await createActivity({
    action: 'PUBLIC_LINK_ENABLED',
    actor,
    clientId: record.clientId,
    db,
    keywordContentListId: listId,
    keywordId,
    metadata: { expiresAt: link.expiresAt.toISOString() },
  });

  return { link: mapLink(link, env) };
}

async function disableLink({ actorUserId, db, query }) {
  const listId = parseUnsignedBigInt(query.listId, 'listId');
  const keywordId = asString(query.keywordId).trim();

  if (!keywordId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywordId is required.');
  }

  const { record } = await getKeywordRecord({ db, keywordId, listId });
  const link = await db.websiteContentReviewLink.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      enabled: true,
      keywordContentListId: listId,
      keywordId,
    },
  });

  if (!link) {
    return { success: true };
  }

  await db.websiteContentReviewLink.update({
    data: {
      disabledAt: new Date(),
      enabled: false,
    },
    where: { id: link.id },
  });

  await createActivity({
    action: 'PUBLIC_LINK_DISABLED',
    actor: { type: 'USER', userId: actorUserId },
    clientId: record.clientId,
    db,
    keywordContentListId: listId,
    keywordId,
  });

  return { success: true };
}

async function sendLinkToClientReview({ actorUserId, db, env, payload }) {
  const listId = parseUnsignedBigInt(payload.listId, 'listId');
  const keywordId = asString(payload.keywordId).trim();
  const publicUrl = asString(payload.publicUrl).trim();

  if (!keywordId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywordId is required.');
  }

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

  const { keyword, record } = await getKeywordRecord({ db, keywordId, listId });
  const link = await db.websiteContentReviewLink.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      enabled: true,
      expiresAt: { gt: new Date() },
      keywordContentListId: listId,
      keywordId,
    },
  });

  if (!link) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Public review link must be enabled before sending to client.'
    );
  }

  const channelId = asString(record.client?.discordChannel).trim();
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

  const articleTitle = asString(keyword?.title || keyword?.keyword).trim();
  const clientName = asString(record.client?.clientName || record.client?.businessName).trim();
  const messageLines = [
    'Please review the content.',
    articleTitle ? `Article: ${articleTitle}` : null,
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
    clientId: record.clientId,
    db,
    keywordContentListId: listId,
    keywordId,
    metadata: { channelId, publicUrl },
  });

  return { sent: true };
}

async function sendBulkLinksToClientReview({ actorUserId, db, env, payload }) {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  if (rawItems.length === 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'At least one review link is required.'
    );
  }

  const botToken = env?.integrations?.discord?.botToken;
  if (!botToken) {
    throw new AppError(
      500,
      'CONFIGURATION_ERROR',
      'Discord bot token is not configured.'
    );
  }

  const seenKeys = new Set();
  const items = [];

  for (const rawItem of rawItems) {
    const listId = parseUnsignedBigInt(rawItem?.listId, 'listId');
    const keywordId = asString(rawItem?.keywordId).trim();
    const publicUrl = asString(rawItem?.publicUrl).trim();
    const dedupeKey = `${String(listId)}:${keywordId}`;

    if (!keywordId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'keywordId is required.');
    }

    if (!publicUrl) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Public review link is required.');
    }

    if (seenKeys.has(dedupeKey)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    seenKeys.add(dedupeKey);

    // eslint-disable-next-line no-await-in-loop
    const { keyword, record } = await getKeywordRecord({ db, keywordId, listId });
    // eslint-disable-next-line no-await-in-loop
    const link = await db.websiteContentReviewLink.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        enabled: true,
        expiresAt: { gt: new Date() },
        keywordContentListId: listId,
        keywordId,
      },
    });

    if (!link) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'All selected content must have public review links enabled.'
      );
    }

    const channelId = asString(record.client?.discordChannel).trim();
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

    items.push({
      channelId,
      clientId: record.clientId,
      keywordContentListId: listId,
      keywordId,
      publicUrl,
      title: asString(keyword?.title || keyword?.keyword).trim() || 'Untitled content',
    });
  }

  const groupedByChannel = new Map();
  for (const item of items) {
    const group = groupedByChannel.get(item.channelId) || [];

    group.push(item);
    groupedByChannel.set(item.channelId, group);
  }

  for (const [channelId, groupItems] of groupedByChannel.entries()) {
    const message = [
      'Please review the following content:',
      '',
      ...groupItems.flatMap((item, index) => [
        `${index + 1}. ${item.title}`,
        item.publicUrl,
        '',
      ]),
    ].join('\n').trim();

    // eslint-disable-next-line no-await-in-loop
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
          content: message,
        }),
      }
    );

    if (!response.ok) {
      let details = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        details = await response.json();
      } catch {
        // eslint-disable-next-line no-await-in-loop
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
  }

  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    await createActivity({
      action: 'PUBLIC_LINK_SENT_TO_CLIENT',
      actor: { type: 'USER', userId: actorUserId },
      clientId: item.clientId,
      db,
      keywordContentListId: item.keywordContentListId,
      keywordId: item.keywordId,
      metadata: { channelId: item.channelId, publicUrl: item.publicUrl },
    });
  }

  return { count: items.length, sent: true };
}

async function createManualBackup({ actorUserId, db, payload }) {
  const listId = parseUnsignedBigInt(payload.listId, 'listId');
  const keywordId = asString(payload.keywordId).trim();

  if (!keywordId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywordId is required.');
  }

  const { keyword, record } = await getKeywordRecord({ db, keywordId, listId });
  const actor = { type: 'USER', userId: actorUserId };

  await createVersion({
    actor,
    clientId: record.clientId,
    db,
    keyword,
    keywordContentListId: listId,
    keywordId,
    source: 'MANUAL_BACKUP',
  });
  await createActivity({
    action: 'MANUAL_BACKUP_CREATED',
    actor,
    clientId: record.clientId,
    db,
    keywordContentListId: listId,
    keywordId,
  });

  return { success: true };
}

async function findActiveLinkByToken({ db, token }) {
  const link = await db.websiteContentReviewLink.findUnique({
    where: { tokenHash: hashValue(token) },
  });

  if (!link || !link.enabled || link.expiresAt <= new Date()) {
    throw new AppError(404, 'NOT_FOUND', 'This review link is unavailable or expired.');
  }

  return link;
}

async function publicStatus({ db, token }) {
  const link = await findActiveLinkByToken({ db, token });
  const { keyword, record } = await getKeywordRecord({
    db,
    keywordId: link.keywordId,
    listId: link.keywordContentListId,
  });

  return {
    articleTitle: asString(keyword.title) || asString(keyword.keyword),
    clientName: record.client?.businessName || record.client?.clientName || 'Client',
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
  const recentCount = await db.websiteContentReviewOtp.count({
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

  await db.websiteContentReviewOtp.create({
    data: {
      email,
      expiresAt: addMinutes(new Date(), env.websiteContentReview.otpExpiresMinutes),
      fullName,
      otpHash: hashValue(`${link.id}:${email}:${otp}`),
      reviewLinkId: link.id,
    },
  });

  await sendWebsiteContentReviewOtpEmail({ email, env, fullName, otp, to: email });

  return { success: true };
}

async function verifyOtp({ db, env, payload, token }) {
  const email = normalizeEmail(payload.email);
  const otp = asString(payload.otp).trim();

  if (!email || !validateEmail(email) || !/^\d{6}$/.test(otp)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid verification details.');
  }

  const link = await findActiveLinkByToken({ db, token });
  const otpRecord = await db.websiteContentReviewOtp.findFirst({
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
    await db.websiteContentReviewOtp.update({
      data: { attemptCount: { increment: 1 } },
      where: { id: otpRecord.id },
    });

    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired verification code.');
  }

  await db.websiteContentReviewOtp.update({
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
    sessionExpiresAt: addHours(new Date(), env.websiteContentReview.sessionExpiresHours).toISOString(),
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
  const { keyword, record } = await getKeywordRecord({
    db,
    keywordId: link.keywordId,
    listId: link.keywordContentListId,
  });
  const [comments, activities] = await Promise.all([
    db.websiteContentReviewComment.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        keywordContentListId: link.keywordContentListId,
        keywordId: link.keywordId,
      },
    }),
    db.websiteContentEditActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      where: {
        keywordContentListId: link.keywordContentListId,
        keywordId: link.keywordId,
      },
    }),
  ]);

  return {
    article: snapshotKeyword(keyword),
    clientName: record.client?.businessName || record.client?.clientName || 'Client',
    comments: comments.map(mapComment),
    history: activities.map(mapActivity),
    reviewer,
  };
}

function normalizePublicUpdatePayload(payload) {
  const source = typeof payload === 'object' && payload !== null ? payload : {};
  const normalized = {};

  for (const [field] of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    normalized[field] = field === 'featuredImage'
      ? source[field] ?? null
      : asString(source[field]).trim();
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
  const { index, keyword, keywords, record } = await getKeywordRecord({
    db,
    keywordId: link.keywordId,
    listId: link.keywordContentListId,
  });
  const patch = normalizePublicUpdatePayload(payload);
  const updatedKeyword = {
    ...keyword,
    ...patch,
  };
  const nextKeywords = [...keywords];
  const actor = {
    email: reviewer.email,
    name: reviewer.fullName,
    type: 'PUBLIC_REVIEWER',
  };

  nextKeywords[index] = updatedKeyword;

  await db.keywordContentList.update({
    data: { keywordsJson: nextKeywords },
    where: { id: link.keywordContentListId },
  });

  await createVersion({
    actor,
    clientId: record.clientId,
    db,
    keyword: updatedKeyword,
    keywordContentListId: link.keywordContentListId,
    keywordId: link.keywordId,
    source: 'PUBLIC_EDIT',
  });

  for (const [field, label] of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const oldValue = stringifyComparable(keyword?.[field]);
    const newValue = stringifyComparable(updatedKeyword?.[field]);

    if (oldValue === newValue) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await createActivity({
      action: 'FIELD_UPDATED',
      actor,
      clientId: record.clientId,
      db,
      fieldName: label,
      keywordContentListId: link.keywordContentListId,
      keywordId: link.keywordId,
      newValue,
      oldValue,
    });
  }

  return { article: snapshotKeyword(updatedKeyword), success: true };
}

async function validatePublicReviewSession({ db, env, reviewSessionToken, token }) {
  await requireReviewSession({
    db,
    env,
    reviewSessionToken,
    token,
  });

  return { success: true };
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
  const { record } = await getKeywordRecord({
    db,
    keywordId: link.keywordId,
    listId: link.keywordContentListId,
  });
  const created = await db.websiteContentReviewComment.create({
    data: {
      authorEmail: reviewer.email,
      authorName: reviewer.fullName,
      clientId: record.clientId,
      comment,
      keywordContentListId: link.keywordContentListId,
      keywordId: link.keywordId,
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
    clientId: record.clientId,
    db,
    keywordContentListId: link.keywordContentListId,
    keywordId: link.keywordId,
    metadata: { commentId: String(created.id) },
    newValue: comment,
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
  const comment = await db.websiteContentReviewComment.findFirst({
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

  await db.websiteContentReviewComment.delete({
    where: { id: parsedCommentId },
  });

  await createActivity({
    action: 'COMMENT_DELETED',
    actor: {
      email: reviewer.email,
      name: reviewer.fullName,
      type: 'PUBLIC_REVIEWER',
    },
    clientId: comment.clientId,
    db,
    keywordContentListId: comment.keywordContentListId,
    keywordId: comment.keywordId,
    metadata: { commentId: String(comment.id) },
    oldValue: comment.comment,
  });

  return { success: true };
}

module.exports = {
  addPublicComment,
  createManualBackup,
  deletePublicComment,
  disableLink,
  enableLink,
  getDashboardState,
  getPublicContent,
  publicStatus,
  savePublicContent,
  validatePublicReviewSession,
  sendBulkLinksToClientReview,
  sendLinkToClientReview,
  sendOtp,
  verifyOtp,
};
