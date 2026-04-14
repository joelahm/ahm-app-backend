const { AppError } = require('../../lib/errors');

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

function parseOptionalUnsignedBigInt(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseUnsignedBigInt(value, fieldName);
}

function normalizeKeywordItem(value) {
  const source = typeof value === 'object' && value !== null ? value : {};

  const title = asString(source.title).trim();
  const keyword = asString(source.keyword).trim();
  const contentType = asString(source.contentType).trim();

  if (!keyword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Keyword is required.');
  }

  if (!contentType) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Content type is required.');
  }

  return {
    contentType,
    cpc: Number.isFinite(source.cpc) ? source.cpc : null,
    id: asString(source.id).trim() || null,
    intent: asString(source.intent).trim() || null,
    kd: Number.isFinite(source.kd) ? source.kd : null,
    keyword,
    searchVolume: Number.isFinite(source.searchVolume) ? source.searchVolume : null,
    title,
  };
}

function normalizeCreatePayload(payload) {
  const source = typeof payload === 'object' && payload !== null ? payload : {};
  const location = asString(source.location).trim();
  const topic = asString(source.topic).trim();
  const audience = asString(source.audience).trim();
  const enableContentClustering = Boolean(source.enableContentClustering);

  if (!location) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Location is required.');
  }

  const keywords = Array.isArray(source.keywords)
    ? source.keywords.map(normalizeKeywordItem)
    : [];

  if (!keywords.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one keyword is required.');
  }

  return {
    audience: audience || null,
    enableContentClustering,
    keywords,
    location,
    topic: topic || null,
  };
}

function mapRecord(record) {
  return {
    audience: record.audience,
    clientId: String(record.clientId),
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    enableContentClustering: Boolean(record.enableContentClustering),
    id: String(record.id),
    keywords: Array.isArray(record.keywordsJson) ? record.keywordsJson : [],
    location: record.location,
    topic: record.topic,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : String(record.updatedAt),
  };
}

async function createKeywordContentList({ actorUserId, db, payload }) {
  const clientId = parseUnsignedBigInt(payload.clientId, 'clientId');
  const normalizedPayload = normalizeCreatePayload(payload);

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const record = await db.keywordContentList.create({
    data: {
      audience: normalizedPayload.audience,
      clientId,
      createdBy: actorUserId ? BigInt(actorUserId) : null,
      enableContentClustering: normalizedPayload.enableContentClustering,
      keywordsJson: normalizedPayload.keywords,
      location: normalizedPayload.location,
      topic: normalizedPayload.topic,
    },
  });

  return {
    keywordContentList: mapRecord(record),
  };
}

async function listKeywordContentLists({ db, query }) {
  const clientId = parseOptionalUnsignedBigInt(query.clientId, 'clientId');
  const where = clientId ? { clientId } : {};
  const records = await db.keywordContentList.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    where,
  });

  return {
    keywordContentLists: records.map(mapRecord),
    total: records.length,
  };
}

module.exports = {
  listKeywordContentLists,
  createKeywordContentList,
};
