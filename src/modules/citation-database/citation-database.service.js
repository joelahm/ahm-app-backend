const { randomUUID } = require('crypto');
const { AppError } = require('../../lib/errors');

const CITATION_DATABASE_SETTINGS_KEY = 'citation_database';
const MAX_CITATION_NICHE_LENGTH = 255;
const ALLOWED_TYPES = new Set(['General', 'Industry', 'Location']);
const ALLOWED_PAYMENTS = new Set(['Free', 'Paid', 'Free/Paid']);
const CITATION_STATUS_PUBLISHED = 'Published';
const CITATION_STATUS_NOT_PUBLISHED = 'Not Published';

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function buildUserDisplayName(user) {
  const firstName = asString(user?.firstName).trim();
  const lastName = asString(user?.lastName).trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || asString(user?.email) || 'Unknown';
}

function normalizeStoredCitation(value) {
  const source = asObject(value);
  const createdBy = asObject(source.createdBy);

  return {
    id: asString(source.id) || `citation-${randomUUID()}`,
    name: asString(source.name || source.directorySite),
    type: asString(source.type),
    niche: asString(source.niche),
    iconUrl: asString(source.iconUrl || source.icon_url),
    validationLink: asString(source.validationLink),
    da: asNumber(source.da),
    payment: asString(source.payment),
    status: asString(source.status) || CITATION_STATUS_PUBLISHED,
    createdAt: asString(source.createdAt) || new Date().toISOString(),
    updatedAt:
      asString(source.updatedAt) ||
      asString(source.createdAt) ||
      new Date().toISOString(),
    createdBy: {
      id: asNumber(createdBy.id, 0),
      name: asString(createdBy.name),
      email: asString(createdBy.email),
    },
  };
}

function parseStoredCitationDatabaseValue(value) {
  const root = asObject(value);
  const rawCitations = Array.isArray(root.citations) ? root.citations : [];

  return {
    citations: rawCitations
      .map((item) => normalizeStoredCitation(item))
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
  };
}

function normalizeCitationName(value) {
  return asString(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeCitationValidationLink(value) {
  const rawValue = asString(value).trim();

  if (!rawValue) {
    return '';
  }

  const candidate = /^[a-z]+:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '');

    return `${hostname}${pathname}` || hostname;
  } catch {
    return rawValue
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
}

function normalizeCitationPayload(payload, options = {}) {
  const source = asObject(payload);
  const name = asString(source.name).trim();
  const rawType = asString(source.type).trim();
  const niche = asString(source.niche).trim();
  const validationLink = asString(source.validationLink).trim();
  const rawPayment = asString(source.payment).trim();
  const da = asNumber(source.da, NaN);
  const allowTypeFallback = options.allowTypeFallback === true;
  const allowPaymentFallback = options.allowPaymentFallback === true;
  const type = rawType && ALLOWED_TYPES.has(rawType) ? rawType : allowTypeFallback ? 'General' : rawType;
  const payment =
    rawPayment && ALLOWED_PAYMENTS.has(rawPayment)
      ? rawPayment
      : allowPaymentFallback
        ? 'Free'
        : rawPayment;

  if (!name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Citation name is required.');
  }

  if (!type || !ALLOWED_TYPES.has(type)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid citation type.');
  }

  if (!niche) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Niche is required.');
  }

  if (niche.length > MAX_CITATION_NICHE_LENGTH) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Niche must be ${MAX_CITATION_NICHE_LENGTH} characters or fewer.`,
    );
  }

  if (!validationLink) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Validation link is required.');
  }

  if (!payment || !ALLOWED_PAYMENTS.has(payment)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid payment type.');
  }

  if (!Number.isFinite(da) || da < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Domain Authority must be a valid number.');
  }

  return { da, name, niche, payment, type, validationLink };
}

async function listExistingCitationCandidates({ db, excludeCitationId = null }) {
  const records = await db.citationDatabaseEntry.findMany({
    select: {
      id: true,
      name: true,
      validationLink: true,
    },
  });

  return records.filter((record) => record.id !== excludeCitationId);
}

function resolveCitationStatus({
  existingCandidates,
  normalizedPayload,
  seenNames,
  seenValidationLinks,
}) {
  const normalizedName = normalizeCitationName(normalizedPayload.name);
  const normalizedValidationLink = normalizeCitationValidationLink(
    normalizedPayload.validationLink,
  );

  const hasNameDuplicate =
    !!normalizedName &&
    (existingCandidates.some(
      (candidate) => normalizeCitationName(candidate.name) === normalizedName,
    ) || seenNames.has(normalizedName));

  const hasValidationLinkDuplicate =
    !!normalizedValidationLink &&
    (existingCandidates.some(
      (candidate) =>
        normalizeCitationValidationLink(candidate.validationLink) ===
        normalizedValidationLink,
    ) || seenValidationLinks.has(normalizedValidationLink));

  if (normalizedName) {
    seenNames.add(normalizedName);
  }

  if (normalizedValidationLink) {
    seenValidationLinks.add(normalizedValidationLink);
  }

  return hasNameDuplicate || hasValidationLinkDuplicate
    ? CITATION_STATUS_NOT_PUBLISHED
    : CITATION_STATUS_PUBLISHED;
}

function hasCitationDuplicates({ existingCandidates, normalizedPayload }) {
  const normalizedName = normalizeCitationName(normalizedPayload.name);
  const normalizedValidationLink = normalizeCitationValidationLink(
    normalizedPayload.validationLink,
  );

  const hasDuplicateName =
    !!normalizedName &&
    existingCandidates.some(
      (candidate) => normalizeCitationName(candidate.name) === normalizedName,
    );

  const hasDuplicateValidationLink =
    !!normalizedValidationLink &&
    existingCandidates.some(
      (candidate) =>
        normalizeCitationValidationLink(candidate.validationLink) ===
        normalizedValidationLink,
    );

  return {
    hasDuplicateName,
    hasDuplicateValidationLink,
  };
}

function mapCitationRecord(record) {
  return {
    id: asString(record.id),
    name: asString(record.name),
    type: asString(record.type),
    niche: asString(record.niche),
    iconUrl: asString(record.iconUrl),
    validationLink: asString(record.validationLink),
    da: asNumber(record.da),
    payment: asString(record.payment),
    status: asString(record.status) || CITATION_STATUS_PUBLISHED,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : asString(record.createdAt),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : asString(record.updatedAt),
    createdBy: {
      id: record.creator?.id ? Number(record.creator.id) : 0,
      name: buildUserDisplayName(record.creator),
      email: asString(record.creator?.email),
    },
  };
}

async function migrateLegacyCitationsIfNeeded({ db }) {
  const currentCount = await db.citationDatabaseEntry.count();
  if (currentCount > 0) {
    return;
  }

  const setting = await db.appSetting.findUnique({ where: { key: CITATION_DATABASE_SETTINGS_KEY } });
  if (!setting) {
    return;
  }

  const legacyCitations = parseStoredCitationDatabaseValue(setting.valueJson).citations;
  if (!legacyCitations.length) {
    return;
  }

  for (const citation of legacyCitations) {
    let createdBy = null;
    const createdById = citation.createdBy?.id;
    if (Number.isFinite(createdById) && createdById > 0) {
      const creator = await db.user.findUnique({ where: { id: BigInt(createdById) }, select: { id: true } });
      createdBy = creator ? BigInt(createdById) : null;
    }

    await db.citationDatabaseEntry.upsert({
      where: { id: citation.id },
      create: {
        id: citation.id,
        name: citation.name,
        type: citation.type,
        niche: citation.niche,
        validationLink: citation.validationLink,
        da: citation.da,
        payment: citation.payment,
        status: citation.status || CITATION_STATUS_PUBLISHED,
        createdBy,
        createdAt: new Date(citation.createdAt),
        updatedAt: new Date(citation.updatedAt),
      },
      update: {
        name: citation.name,
        type: citation.type,
        niche: citation.niche,
        validationLink: citation.validationLink,
        da: citation.da,
        payment: citation.payment,
        status: citation.status || CITATION_STATUS_PUBLISHED,
        createdBy,
        createdAt: new Date(citation.createdAt),
        updatedAt: new Date(citation.updatedAt),
      }
    });
  }
}

async function getCitationDatabase({ db }) {
  await migrateLegacyCitationsIfNeeded({ db });

  const citations = await db.citationDatabaseEntry.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    }
  });

  return { citations: citations.map((record) => mapCitationRecord(record)) };
}

async function buildActorId({ db, actorUserId }) {
  const user = await db.user.findUnique({
    where: { id: BigInt(actorUserId) },
    select: { id: true }
  });
  return user ? user.id : BigInt(actorUserId);
}

async function createCitation({ db, actorUserId, payload }) {
  await migrateLegacyCitationsIfNeeded({ db });
  const normalizedPayload = normalizeCitationPayload(payload);
  const createdBy = await buildActorId({ db, actorUserId });
  const existingCandidates = await listExistingCitationCandidates({ db });
  const { hasDuplicateName, hasDuplicateValidationLink } = hasCitationDuplicates({
    existingCandidates,
    normalizedPayload,
  });

  if (hasDuplicateName || hasDuplicateValidationLink) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Duplicate citation name or validation link already exists.',
    );
  }

  const citation = await db.citationDatabaseEntry.create({
    data: {
      id: `citation-${randomUUID()}`,
      ...normalizedPayload,
      status: CITATION_STATUS_PUBLISHED,
      createdBy,
    },
    include: {
      creator: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    }
  });

  return { success: true, citation: mapCitationRecord(citation) };
}

async function updateCitation({ db, citationId, payload }) {
  await migrateLegacyCitationsIfNeeded({ db });
  const normalizedPayload = normalizeCitationPayload(payload);

  const existingCitation = await db.citationDatabaseEntry.findUnique({ where: { id: citationId }, select: { id: true } });
  if (!existingCitation) {
    throw new AppError(404, 'NOT_FOUND', 'Citation not found.');
  }

  const existingCandidates = await listExistingCitationCandidates({
    db,
    excludeCitationId: citationId,
  });
  const { hasDuplicateName, hasDuplicateValidationLink } = hasCitationDuplicates({
    existingCandidates,
    normalizedPayload,
  });

  if (hasDuplicateName || hasDuplicateValidationLink) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Duplicate citation name or validation link already exists.',
    );
  }

  const citation = await db.citationDatabaseEntry.update({
    where: { id: citationId },
    data: {
      ...normalizedPayload,
      status: CITATION_STATUS_PUBLISHED,
    },
    include: {
      creator: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    }
  });

  return { success: true, citation: mapCitationRecord(citation) };
}

async function deleteCitation({ db, citationId }) {
  await migrateLegacyCitationsIfNeeded({ db });

  const existingCitation = await db.citationDatabaseEntry.findUnique({ where: { id: citationId }, select: { id: true } });
  if (!existingCitation) {
    throw new AppError(404, 'NOT_FOUND', 'Citation not found.');
  }

  await db.citationDatabaseEntry.delete({ where: { id: citationId } });
  return { success: true };
}

async function bulkCreateCitations({ db, actorUserId, payload }) {
  await migrateLegacyCitationsIfNeeded({ db });
  const source = asObject(payload);
  const citations = Array.isArray(source.citations) ? source.citations : [];

  if (!citations.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one citation is required.');
  }

  const normalizedCitations = citations.map((citation) =>
    normalizeCitationPayload(citation, {
      allowPaymentFallback: true,
      allowTypeFallback: true,
    }),
  );
  const createdBy = await buildActorId({ db, actorUserId });
  const existingCandidates = await listExistingCitationCandidates({ db });
  const seenNames = new Set();
  const seenValidationLinks = new Set();

  const createdCitations = [];
  for (const citation of normalizedCitations) {
    const status = resolveCitationStatus({
      existingCandidates,
      normalizedPayload: citation,
      seenNames,
      seenValidationLinks,
    });
    const created = await db.citationDatabaseEntry.create({
      data: {
        id: `citation-${randomUUID()}`,
        ...citation,
        status,
        createdBy,
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });
    createdCitations.push(mapCitationRecord(created));
  }

  return { success: true, citations: createdCitations };
}

module.exports = {
  bulkCreateCitations,
  createCitation,
  deleteCitation,
  getCitationDatabase,
  updateCitation,
};
