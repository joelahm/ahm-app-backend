const { AppError } = require('../../lib/errors');
const { fetchDataForSeoRankings } = require('../integrations/integrations.service');

const ALLOWED_FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);
const ALLOWED_SCAN_STATUSES = new Set(['ACTIVE', 'PAUSED']);
const LOCAL_RANKINGS_SAVED_KEYWORDS_PREFIX = 'local_rankings_saved_keywords';

function parsePositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  return number;
}

function parseOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  return parsePositiveInteger(value, fieldName);
}

function parseStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be an array.`);
  }

  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (!normalized.length) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must contain at least one item.`);
  }

  return Array.from(new Set(normalized));
}

function buildSavedLocalRankingKeywordsKey({ clientId, actorUserId }) {
  return `${LOCAL_RANKINGS_SAVED_KEYWORDS_PREFIX}:${clientId}:${actorUserId}`;
}

function parseSavedKeywordsValue(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

function parseKeywordList(payload) {
  if (payload.keywords !== undefined) {
    return parseStringArray(payload.keywords, 'keywords');
  }

  const keyword = String(payload.keyword || '').trim();
  if (!keyword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keyword or keywords is required.');
  }

  return [keyword];
}

function parseCoveragePoints(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'coverage must be a non-empty array of coordinates.');
  }

  return value.map((point, index) => {
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new AppError(400, 'VALIDATION_ERROR', `coverage[${index}].latitude must be between -90 and 90.`);
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AppError(400, 'VALIDATION_ERROR', `coverage[${index}].longitude must be between -180 and 180.`);
    }

    return {
      label: String(point?.label || '').trim() || null,
      latitude,
      longitude
    };
  });
}

function parseFrequency(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!ALLOWED_FREQUENCIES.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'frequency must be DAILY, WEEKLY, BIWEEKLY, or MONTHLY.');
  }
  return normalized;
}

function parseTime(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be in HH:MM format.`);
  }
  return normalized;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new AppError(400, 'VALIDATION_ERROR', 'recurrenceEnabled must be a boolean.');
}

function parseDate(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be in YYYY-MM-DD format.`);
  }
  return normalized;
}

function parseDateTime(startDate, startTime) {
  const timestamp = new Date(`${startDate}T${startTime}:00`);
  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid start date/time.');
  }
  return timestamp;
}

function addFrequency(date, frequency) {
  const next = new Date(date.getTime());
  if (frequency === 'DAILY') next.setDate(next.getDate() + 1);
  if (frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
  if (frequency === 'BIWEEKLY') next.setDate(next.getDate() + 14);
  if (frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
  return next;
}

function computeNextRunAt({ startAt, frequency }) {
  const now = new Date();
  let candidate = new Date(startAt.getTime());
  while (candidate <= now) {
    candidate = addFrequency(candidate, frequency);
  }
  return candidate;
}

function computeNextRunAfter({ baseDate, frequency }) {
  return addFrequency(baseDate, frequency);
}

function computeInitialRecurringNextRunAt({
  startAt,
  frequency,
  runImmediately
}) {
  const baseDate = runImmediately
    ? addFrequency(startAt, frequency)
    : new Date(startAt.getTime());

  return computeNextRunAt({
    startAt: baseDate,
    frequency
  });
}

function resolveRecurringStateAfterCompletion({
  currentNextRunAt,
  frequency,
  remainingRuns,
  runStartedAt,
}) {
  if (!frequency) {
    return {
      nextRunAt: null,
      remainingRuns: null
    };
  }

  if (currentNextRunAt) {
    const scheduledTime = new Date(currentNextRunAt);

    // If this run happened before the next scheduled slot, keep the existing
    // schedule instead of skipping an interval.
    if (runStartedAt < scheduledTime) {
      return {
        nextRunAt: scheduledTime,
        remainingRuns
      };
    }

    const nextRemainingRuns = Math.max(Number(remainingRuns || 0) - 1, 0);

    return {
      nextRunAt: nextRemainingRuns > 0
        ? computeNextRunAfter({
          baseDate: scheduledTime,
          frequency
        })
        : null,
      remainingRuns: nextRemainingRuns
    };
  }

  return {
    nextRunAt: null,
    remainingRuns: Math.max(Number(remainingRuns || 0), 0)
  };
}

function parseRepeatTime(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'repeatTime must be a positive integer.');
  }
  return number;
}

function parseStatus(value) {
  if (value === undefined) return 'ACTIVE';
  const normalized = String(value || '').trim().toUpperCase();
  if (!ALLOWED_SCAN_STATUSES.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be ACTIVE or PAUSED.');
  }
  return normalized;
}

function mapScan(scan) {
  return {
    id: Number(scan.id),
    clientId: Number(scan.clientId),
    gbpProfileId: Number(scan.gbpProfileId),
    gbpProfile: scan.gbpProfile
      ? {
        id: Number(scan.gbpProfile.id),
        placeId: scan.gbpProfile.placeId,
        title: scan.gbpProfile.title,
        address: scan.gbpProfile.address,
        website: scan.gbpProfile.website
      }
      : null,
    keyword: scan.keyword,
    coverageUnit: scan.coverageUnit,
    coverage: Array.isArray(scan.coveragePoints) ? scan.coveragePoints : [],
    labels: Array.isArray(scan.labels) ? scan.labels : [],
    recurrenceEnabled: Boolean(scan.recurrenceEnabled),
    frequency: scan.frequency,
    repeatTime: scan.repeatTime,
    remainingRuns: scan.remainingRuns == null ? null : Number(scan.remainingRuns),
    startAt: scan.startAt,
    nextRunAt: scan.nextRunAt,
    estimatedRequests: scan.estimatedRequests,
    status: scan.status,
    createdBy: scan.createdBy ? Number(scan.createdBy) : null,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
    latestRun: scan.runs?.[0] ? mapScanRun(scan.runs[0], false) : null
  };
}

function mapScanRun(run, includeResults = true) {
  return {
    id: Number(run.id),
    scanId: Number(run.scanId),
    status: run.status,
    totalRequests: run.totalRequests,
    completedRequests: run.completedRequests,
    failedRequests: run.failedRequests,
    triggeredBy: run.triggeredBy ? Number(run.triggeredBy) : null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    summary: run.summary || null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    results: includeResults ? (run.results || []).map(mapScanResult) : undefined
  };
}

function normalizeScanCandidate(item) {
  if (!item || typeof item !== 'object') return null;
  const rawRating = item.rating;
  const normalizedRating =
    rawRating && typeof rawRating === 'object'
      ? rawRating.value
      : rawRating;
  const normalizedReviews =
    rawRating && typeof rawRating === 'object'
      ? (
        rawRating.votes_count ??
        rawRating.votesCount ??
        rawRating.reviews_count ??
        rawRating.reviewsCount
      )
      : (item.reviews_count ?? item.reviewsCount);
  const normalizedPhotos =
    item.total_photos ??
    item.photos_count ??
    item.photosCount ??
    (item.photos && typeof item.photos === 'object'
      ? (item.photos.total ?? item.photos.count)
      : null);
  const additionalCategories = Array.isArray(item.additional_categories)
    ? item.additional_categories
    : [];
  const categories = Array.isArray(item.categories) ? item.categories : [];

  return {
    rankAbsolute: item.rankAbsolute ?? item.rank_absolute ?? null,
    rankGroup: item.rankGroup ?? item.rank_group ?? null,
    title: item.title ?? item.title_original ?? item.business_name ?? null,
    domain: item.domain ?? null,
    placeId: item.placeId ?? item.place_id ?? null,
    address: item.address ?? null,
    phone: item.phone ?? null,
    rating: normalizedRating ?? null,
    reviewsCount: normalizedReviews ?? null,
    photos: normalizedPhotos ?? null,
    primaryCategory:
      item.category_name ??
      item.category ??
      item.main_category ??
      categories[0] ??
      null,
    secondaryCategory:
      additionalCategories[0] ??
      item.secondary_category ??
      item.second_category ??
      categories[1] ??
      null,
    raw: item
  };
}

function extractCandidatesFromExternalApiLog(responsePayload) {
  const tasks = responsePayload?.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return [];

  const blocks = tasks.flatMap((task) => task?.result || []);
  const candidates = [];
  for (const block of blocks) {
    const items = Array.isArray(block?.items) ? block.items : [];
    for (const item of items) {
      if (Array.isArray(item?.items) && item.items.length) {
        for (const nested of item.items) {
          const candidate = normalizeScanCandidate(nested);
          if (candidate) candidates.push(candidate);
        }
        continue;
      }
      const candidate = normalizeScanCandidate(item);
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates
    .sort((a, b) => {
      const rankA = a.rankAbsolute ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.rankAbsolute ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    });
}

function emitScanEvent(io, scanId, runId, event, payload) {
  if (!io) return;
  io.to(`scan:${scanId}`).emit(event, payload);
  io.to(`scan-run:${runId}`).emit(event, payload);
}

function mapScanResult(result) {
  return {
    id: Number(result.id),
    scanRunId: Number(result.scanRunId),
    keyword: result.keyword,
    coordinateLabel: result.coordinateLabel ?? null,
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    rankAbsolute: result.rankAbsolute ?? null,
    rankGroup: result.rankGroup ?? null,
    matchedTitle: result.matchedTitle ?? null,
    matchedDomain: result.matchedDomain ?? null,
    matchedPlaceId: result.matchedPlaceId ?? null,
    matchedAddress: result.matchedAddress ?? null,
    matchedPhone: result.matchedPhone ?? null,
    matchedRating: result.matchedRating === null || result.matchedRating === undefined ? null : Number(result.matchedRating),
    matchedItem: result.matchedItem ?? null,
    apiLogId: result.apiLogId ? Number(result.apiLogId) : null,
    createdAt: result.createdAt
  };
}

async function enrichMappedScanResults(db, results) {
  const mappedResults = results.map(mapScanResult);
  const apiLogIds = mappedResults
    .map((result) => result.apiLogId)
    .filter(Boolean);

  if (!apiLogIds.length) {
    return mappedResults;
  }

  const logs = await db.externalApiLog.findMany({
    where: {
      id: { in: apiLogIds.map((id) => BigInt(id)) }
    },
    select: {
      id: true,
      responsePayload: true
    }
  });

  const logsById = new Map(logs.map((log) => [Number(log.id), log]));
  const updates = [];

  const enrichedResults = mappedResults.map((result) => {
    if (result.rankAbsolute !== null || !result.apiLogId) {
      return result;
    }

    const linkedLog = logsById.get(result.apiLogId);
    if (!linkedLog?.responsePayload) {
      return result;
    }

    return result;
  });

  if (updates.length) {
    await Promise.all(
      updates.map((update) => db.scanResult.update({
        where: { id: BigInt(update.id) },
        data: {
          rankAbsolute: update.rankAbsolute,
          rankGroup: update.rankGroup,
          matchedTitle: update.matchedTitle,
          matchedDomain: update.matchedDomain,
          matchedPlaceId: update.matchedPlaceId,
          matchedAddress: update.matchedAddress,
          matchedPhone: update.matchedPhone,
          matchedRating: update.matchedRating,
          matchedItem: update.matchedItem
        }
      }))
    );
  }

  return enrichedResults;
}

async function mapScanRunWithFallback(db, run) {
  const mapped = mapScanRun(run);
  if (!Array.isArray(mapped.results) || !mapped.results.length) {
    return mapped;
  }

  return {
    ...mapped,
    results: await enrichMappedScanResults(db, run.results || [])
  };
}

async function getValidatedClientAndProfile(db, clientId, gbpProfileId) {
  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    include: { gbpProfile: true }
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }
  if (!client.gbpProfile) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Client does not have a saved GBP profile.');
  }
  if (gbpProfileId && Number(client.gbpProfile.id) !== gbpProfileId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'gbpProfileId does not match the client GBP profile.');
  }

  return client;
}

function buildCreatePayload(payload) {
  const clientId = parsePositiveInteger(payload.clientId, 'clientId');
  const gbpProfileId = parseOptionalPositiveInteger(payload.gbpProfileId, 'gbpProfileId');
  const keywords = parseKeywordList(payload);
  const coverage = parseCoveragePoints(payload.coverage || payload.coordinates);
  const labels = payload.labels === undefined ? [] : parseStringArray(payload.labels, 'labels');
  const coverageUnit = String(payload.coverageUnit || payload.unit || '').trim().toUpperCase();
  if (coverageUnit !== 'KILOMETERS' && coverageUnit !== 'MILES') {
    throw new AppError(400, 'VALIDATION_ERROR', 'coverageUnit must be KILOMETERS or MILES.');
  }

  const hasRecurrenceFields =
    payload.frequency !== undefined ||
    payload.repeatTime !== undefined ||
    payload.startDate !== undefined ||
    payload.startTime !== undefined;
  const recurrenceEnabled = parseBoolean(
    payload.recurrenceEnabled,
    hasRecurrenceFields
  );
  // Guard against clients accidentally sending recurrenceEnabled=false while
  // still sending frequency/schedule fields.
  const effectiveRecurrenceEnabled = recurrenceEnabled || hasRecurrenceFields;
  const runImmediately = payload.runNow === true || payload.runNow === 'true' || payload.runNow === 1 || payload.runNow === '1';
  let frequency = null;
  let repeatTime = null;
  let remainingRuns = null;
  let startAt = null;
  let nextRunAt = null;

  if (effectiveRecurrenceEnabled) {
    frequency = parseFrequency(payload.frequency);
    repeatTime = parseRepeatTime(payload.repeatTime);
    remainingRuns = repeatTime;
    const startDate = parseDate(payload.startDate, 'startDate');
    const startTime = parseTime(payload.startTime, 'startTime');
    startAt = parseDateTime(startDate, startTime);
    nextRunAt = computeInitialRecurringNextRunAt({
      startAt,
      frequency,
      runImmediately
    });
  }

  const status = parseStatus(payload.status);
  const estimatedRequests = keywords.length * coverage.length;

  return {
    clientId,
    gbpProfileId,
    keywords,
    coverage,
    coverageUnit,
    labels,
    recurrenceEnabled: effectiveRecurrenceEnabled,
    frequency,
    repeatTime,
    remainingRuns,
    startAt,
    nextRunAt,
    status,
    estimatedRequests
  };
}

async function createScan({ db, actorUserId, payload }) {
  const parsed = buildCreatePayload(payload);
  const client = await getValidatedClientAndProfile(db, parsed.clientId, parsed.gbpProfileId);
  const created = await Promise.all(parsed.keywords.map((keyword) => db.scan.create({
    data: {
      clientId: BigInt(parsed.clientId),
      gbpProfileId: client.gbpProfile.id,
      keyword,
      coverageUnit: parsed.coverageUnit,
      coveragePoints: parsed.coverage,
      labels: parsed.labels,
      recurrenceEnabled: parsed.recurrenceEnabled,
      frequency: parsed.frequency,
      repeatTime: parsed.repeatTime,
      remainingRuns: parsed.remainingRuns,
      startAt: parsed.startAt,
      nextRunAt: parsed.nextRunAt,
      estimatedRequests: parsed.coverage.length,
      status: parsed.status,
      createdBy: BigInt(actorUserId)
    },
    include: {
      gbpProfile: true,
      runs: {
        orderBy: { id: 'desc' },
        take: 1
      }
    }
  })));

  return created.map(mapScan);
}

async function listScans({ db, clientId, page = 1, limit = 20 }) {
  const scansPage = Number(page);
  const scansLimit = Number(limit);
  if (!Number.isInteger(scansPage) || scansPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(scansLimit) || scansLimit <= 0 || scansLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const where = {};
  if (clientId !== undefined) {
    where.clientId = BigInt(parsePositiveInteger(clientId, 'clientId'));
  }

  const skip = (scansPage - 1) * scansLimit;
  const [total, scans] = await Promise.all([
    db.scan.count({ where }),
    db.scan.findMany({
      where,
      include: {
        gbpProfile: true,
        runs: {
          orderBy: { id: 'desc' },
          take: 1
        }
      },
      orderBy: { id: 'desc' },
      skip,
      take: scansLimit
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / scansLimit));
  const hasPrev = scansPage > 1;
  const hasNext = scansPage < totalPages;

  return {
    scans: scans.map(mapScan),
    pagination: {
      page: scansPage,
      limit: scansLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? scansPage - 1 : null,
      nextPage: hasNext ? scansPage + 1 : null
    }
  };
}

async function getScanById({ db, scanId }) {
  const scan = await db.scan.findUnique({
    where: { id: BigInt(scanId) },
    include: {
      gbpProfile: true,
      runs: {
        orderBy: { id: 'desc' },
        take: 1
      }
    }
  });
  if (!scan) {
    throw new AppError(404, 'NOT_FOUND', 'Scan not found.');
  }
  return mapScan(scan);
}

async function getClientScanById({ db, clientId, scanId }) {
  const scan = await db.scan.findFirst({
    where: {
      id: BigInt(scanId),
      clientId: BigInt(clientId)
    },
    include: {
      gbpProfile: true,
      runs: {
        orderBy: { id: 'desc' },
        take: 1
      }
    }
  });

  if (!scan) {
    throw new AppError(404, 'NOT_FOUND', 'Scan not found for this client.');
  }

  return mapScan(scan);
}

async function deleteScanKeyword({ db, scanId, keyword }) {
  const normalizedKeyword = String(keyword || '').trim();

  const scan = await db.scan.findUnique({
    where: { id: BigInt(scanId) },
    include: {
      runs: {
        where: {
          status: { in: ['PENDING', 'RUNNING'] }
        },
        select: { id: true },
        take: 1
      }
    }
  });

  if (!scan) {
    throw new AppError(404, 'NOT_FOUND', 'Scan not found.');
  }
  if (scan.runs.length) {
    throw new AppError(409, 'CONFLICT', 'Cannot delete a keyword while a scan run is in progress.');
  }

  if (normalizedKeyword && scan.keyword !== normalizedKeyword) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword not found in scan.');
  }

  await db.scan.delete({
    where: { id: BigInt(scanId) }
  });

  return {
    success: true,
    scanId,
    deletedKeyword: scan.keyword
  };
}

async function deleteScanById({ db, scanId }) {
  return deleteScanKeyword({ db, scanId });
}

function chooseBestMatch(result) {
  if (!Array.isArray(result?.matchedRankings) || !result.matchedRankings.length) {
    return null;
  }

  return result.matchedRankings
    .slice()
    .sort((a, b) => {
      const rankA = a.rankAbsolute ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.rankAbsolute ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    })[0];
}

function chooseFallbackCandidate(result) {
  if (!Array.isArray(result?.topCandidates) || !result.topCandidates.length) {
    return null;
  }

  return result.topCandidates
    .slice()
    .sort((a, b) => {
      const rankA = a.rankAbsolute ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.rankAbsolute ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    })[0];
}

async function startScanRun({ db, actorUserId, scanId }) {
  const scan = await db.scan.findUnique({
    where: { id: BigInt(scanId) },
    include: {
      client: true,
      gbpProfile: true
    }
  });

  if (!scan) {
    throw new AppError(404, 'NOT_FOUND', 'Scan not found.');
  }
  if (scan.status !== 'ACTIVE') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Only ACTIVE scans can be run.');
  }

  const existingRun = await db.scanRun.findFirst({
    where: {
      scanId: scan.id,
      status: { in: ['PENDING', 'RUNNING'] }
    },
    orderBy: { id: 'desc' }
  });
  if (existingRun) {
    throw new AppError(409, 'CONFLICT', 'A scan run is already in progress for this scan.', {
      runId: Number(existingRun.id)
    });
  }

  const coveragePoints = Array.isArray(scan.coveragePoints) ? scan.coveragePoints : [];
  const totalRequests = coveragePoints.length;
  if (!totalRequests) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Scan has no keyword/coverage combinations to execute.');
  }

  const run = await db.scanRun.create({
    data: {
      scanId: scan.id,
      status: 'RUNNING',
      totalRequests,
      triggeredBy: actorUserId ? BigInt(actorUserId) : null
    }
  });

  return mapScanRun(run, false);
}

async function executeScanRun({ db, env, actorUserId, scanId, runId, io }) {
  let scan;
  let run;
  let completedRequests = 0;
  let failedRequests = 0;

  try {
    scan = await db.scan.findUnique({
      where: { id: BigInt(scanId) },
      include: {
        client: true,
        gbpProfile: true
      }
    });

    if (!scan) {
      throw new AppError(404, 'NOT_FOUND', 'Scan not found.');
    }

    run = await db.scanRun.findFirst({
      where: {
        id: BigInt(runId),
        scanId: scan.id
      }
    });
    if (!run) {
      throw new AppError(404, 'NOT_FOUND', 'Scan run not found.');
    }

    const resultRows = [];
    const keywords = [scan.keyword];
    const coveragePoints = Array.isArray(scan.coveragePoints) ? scan.coveragePoints : [];
    const totalRequests = keywords.length * coveragePoints.length;

    emitScanEvent(io, Number(scan.id), Number(run.id), 'scan:run-started', {
      scanId: Number(scan.id),
      runId: Number(run.id),
      totalRequests
    });

    for (const keyword of keywords) {
      for (const point of coveragePoints) {
        try {
          const ranking = await fetchDataForSeoRankings({
            db,
            env,
            requestedBy: actorUserId,
            payload: {
              clientId: Number(scan.clientId),
              keyword,
              languageCode: 'en',
              locationCoordinate: `${point.latitude},${point.longitude}`,
              targetPlaceId: scan.gbpProfile?.placeId || undefined,
              targetBusinessName: scan.gbpProfile?.title || undefined,
              targetDomain: scan.client?.website || scan.gbpProfile?.website || undefined,
              forceRefresh: true
            }
          });

          const bestMatch = chooseBestMatch(ranking);
          const selectedCandidate = bestMatch || null;
          resultRows.push({
            scanRunId: run.id,
            keyword,
            coordinateLabel: point.label || null,
            latitude: point.latitude,
            longitude: point.longitude,
            rankAbsolute: selectedCandidate?.rankAbsolute ?? null,
            rankGroup: selectedCandidate?.rankGroup ?? null,
            matchedTitle: selectedCandidate?.title ?? null,
            matchedDomain: selectedCandidate?.domain ?? null,
            matchedPlaceId: selectedCandidate?.placeId ?? null,
            matchedAddress: selectedCandidate?.address ?? null,
            matchedPhone: selectedCandidate?.phone ?? null,
            matchedRating: selectedCandidate?.rating ?? null,
            matchedItem: bestMatch
              ? {
                source: 'EXACT_MATCH',
                candidate: bestMatch
              }
              : {
                reason: 'GBP_NOT_FOUND_IN_RESULTS',
                targetPlaceId: scan.gbpProfile?.placeId || null,
                targetBusinessName: scan.gbpProfile?.title || null,
                targetDomain: scan.client?.website || scan.gbpProfile?.website || null,
                topCandidates: ranking.topCandidates || []
              },
            apiLogId: ranking.logId ? BigInt(ranking.logId) : null
          });
          completedRequests += 1;
        } catch (error) {
          failedRequests += 1;
          resultRows.push({
            scanRunId: run.id,
            keyword,
            coordinateLabel: point.label || null,
            latitude: point.latitude,
            longitude: point.longitude,
            matchedItem: {
              error: error.message,
              code: error.code || 'SCAN_ITEM_FAILED'
            }
          });
        }

        await db.scanRun.update({
          where: { id: run.id },
          data: {
            completedRequests,
            failedRequests
          }
        });

        emitScanEvent(io, Number(scan.id), Number(run.id), 'scan:run-progress', {
          scanId: Number(scan.id),
          runId: Number(run.id),
          totalRequests,
          completedRequests,
          failedRequests,
          processedRequests: completedRequests + failedRequests
        });
      }
    }

    if (resultRows.length) {
      await db.scanResult.createMany({ data: resultRows });
    }

    const finishedAt = new Date();
    const runStatus = failedRequests === 0 ? 'COMPLETED' : completedRequests > 0 ? 'PARTIAL_SUCCESS' : 'FAILED';
    const summary = {
      keywords: 1,
      coordinates: coveragePoints.length,
      successfulChecks: completedRequests,
      failedChecks: failedRequests
    };

    await db.scanRun.update({
      where: { id: run.id },
      data: {
        status: runStatus,
        completedRequests,
        failedRequests,
        finishedAt,
        summary
      }
    });

    const recurringState = scan.recurrenceEnabled
      ? resolveRecurringStateAfterCompletion({
        currentNextRunAt: scan.nextRunAt,
        frequency: scan.frequency,
        runStartedAt: run.startedAt,
        remainingRuns: scan.remainingRuns
      })
      : { nextRunAt: null, remainingRuns: null };

    await db.scan.update({
      where: { id: scan.id },
      data: {
        nextRunAt: recurringState.nextRunAt,
        remainingRuns: recurringState.remainingRuns
      }
    });

    const savedRun = await db.scanRun.findUnique({
      where: { id: run.id },
      include: {
        results: {
          orderBy: { id: 'asc' }
        }
      }
    });

    const mappedRun = await mapScanRunWithFallback(db, savedRun);

    emitScanEvent(io, Number(scan.id), Number(run.id), 'scan:run-completed', {
      scanId: Number(scan.id),
      run: mappedRun
    });

    return mappedRun;
  } catch (error) {
    if (run && scan) {
      const finishedAt = new Date();
      await db.scanRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedRequests,
          failedRequests: failedRequests + 1,
          finishedAt,
          summary: {
            error: error.message,
            successfulChecks: completedRequests,
            failedChecks: failedRequests + 1
          }
        }
      }).catch(() => {});

      emitScanEvent(io, Number(scan.id), Number(run.id), 'scan:run-failed', {
        scanId: Number(scan.id),
        runId: Number(run.id),
        error: {
          code: error.code || 'SCAN_RUN_FAILED',
          message: error.message
        }
      });
    }
    throw error;
  }
}

async function listScanRuns({ db, scanId, page = 1, limit = 20 }) {
  const runsPage = Number(page);
  const runsLimit = Number(limit);
  if (!Number.isInteger(runsPage) || runsPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(runsLimit) || runsLimit <= 0 || runsLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const scanExists = await db.scan.findUnique({ where: { id: BigInt(scanId) }, select: { id: true } });
  if (!scanExists) {
    throw new AppError(404, 'NOT_FOUND', 'Scan not found.');
  }

  const where = { scanId: BigInt(scanId) };
  const skip = (runsPage - 1) * runsLimit;
  const [total, runs] = await Promise.all([
    db.scanRun.count({ where }),
    db.scanRun.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: runsLimit
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / runsLimit));
  const hasPrev = runsPage > 1;
  const hasNext = runsPage < totalPages;

  return {
    runs: runs.map((run) => mapScanRun(run, false)),
    pagination: {
      page: runsPage,
      limit: runsLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? runsPage - 1 : null,
      nextPage: hasNext ? runsPage + 1 : null
    }
  };
}

async function getScanRunById({ db, scanId, runId }) {
  const run = await db.scanRun.findFirst({
    where: {
      id: BigInt(runId),
      scanId: BigInt(scanId)
    },
    include: {
      results: {
        orderBy: { id: 'asc' }
      }
    }
  });

  if (!run) {
    throw new AppError(404, 'NOT_FOUND', 'Scan run not found.');
  }

  return mapScanRunWithFallback(db, run);
}

async function buildRunKeywordDetails({ db, run }) {
  const normalizedKeyword = String(run.scan?.keyword || '').trim();
  if (!normalizedKeyword) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword not found for this scan run.');
  }

  const keywordResults = (run.results || []).filter((result) => result.keyword === normalizedKeyword);
  if (!keywordResults.length) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword not found for this scan run.');
  }

  const enrichedResults = await enrichMappedScanResults(db, keywordResults);
  const apiLogIds = Array.from(new Set(
    enrichedResults
      .map((result) => result.apiLogId)
      .filter(Boolean)
  ));
  const apiLogs = apiLogIds.length
    ? await db.externalApiLog.findMany({
      where: {
        id: { in: apiLogIds.map((id) => BigInt(id)) }
      },
      select: {
        id: true,
        responsePayload: true
      }
    })
    : [];
  const competitorsByKey = new Map();
  for (const log of apiLogs) {
    const candidates = extractCandidatesFromExternalApiLog(log.responsePayload);
    for (const candidate of candidates) {
      const businessName = String(candidate.title || '').trim();
      if (!businessName) {
        continue;
      }

      const key =
        String(candidate.placeId || '').trim() ||
        String(candidate.domain || '').trim() ||
        `${businessName.toLowerCase()}::${String(candidate.address || '').toLowerCase()}`;
      const existing = competitorsByKey.get(key) || {
        key,
        businessName,
        address: candidate.address ?? null,
        domain: candidate.domain ?? null,
        primaryCategory: candidate.primaryCategory ?? null,
        secondaryCategory: candidate.secondaryCategory ?? null,
        photos: candidate.photos ?? null,
        rating: candidate.rating ?? null,
        reviewsCount: candidate.reviewsCount ?? null,
        bestRank: null,
        rankTotal: 0,
        rankCount: 0
      };

      if (!existing.address && candidate.address) {
        existing.address = candidate.address;
      }
      if (!existing.domain && candidate.domain) {
        existing.domain = candidate.domain;
      }
      if (!existing.primaryCategory && candidate.primaryCategory) {
        existing.primaryCategory = candidate.primaryCategory;
      }
      if (!existing.secondaryCategory && candidate.secondaryCategory) {
        existing.secondaryCategory = candidate.secondaryCategory;
      }
      if (existing.photos === null || existing.photos === undefined) {
        existing.photos = candidate.photos ?? null;
      }
      if (existing.rating === null || existing.rating === undefined) {
        existing.rating = candidate.rating ?? null;
      }
      if (existing.reviewsCount === null || existing.reviewsCount === undefined) {
        existing.reviewsCount = candidate.reviewsCount ?? null;
      }

      if (candidate.rankAbsolute !== null && candidate.rankAbsolute !== undefined) {
        existing.bestRank = existing.bestRank === null
          ? candidate.rankAbsolute
          : Math.min(existing.bestRank, candidate.rankAbsolute);
        existing.rankTotal += candidate.rankAbsolute;
        existing.rankCount += 1;
      }

      competitorsByKey.set(key, existing);
    }
  }
  const competitors = Array.from(competitorsByKey.values())
    .map((entry) => ({
      key: entry.key,
      businessName: entry.businessName,
      address: entry.address,
      domain: entry.domain,
      primaryCategory: entry.primaryCategory,
      secondaryCategory: entry.secondaryCategory,
      photos:
        entry.photos === null || entry.photos === undefined
          ? null
          : Number(entry.photos),
      rating:
        entry.rating === null || entry.rating === undefined
          ? null
          : Number(entry.rating),
      reviewsCount:
        entry.reviewsCount === null || entry.reviewsCount === undefined
          ? null
          : Number(entry.reviewsCount),
      bestRank: entry.bestRank,
      averageRank: entry.rankCount
        ? Number((entry.rankTotal / entry.rankCount).toFixed(2))
        : null
    }))
    .sort((a, b) => {
      const rankA = a.averageRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.averageRank ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return a.businessName.localeCompare(b.businessName);
    });
  const rankedCoordinates = enrichedResults.filter((result) => result.rankAbsolute !== null);
  const totalRank = rankedCoordinates.reduce((sum, result) => sum + result.rankAbsolute, 0);
  const averageRank = rankedCoordinates.length
    ? Number((totalRank / rankedCoordinates.length).toFixed(2))
    : null;
  const bestRank = rankedCoordinates.length
    ? Math.min(...rankedCoordinates.map((result) => result.rankAbsolute))
    : null;
  const worstRank = rankedCoordinates.length
    ? Math.max(...rankedCoordinates.map((result) => result.rankAbsolute))
    : null;

  return {
    scanId: Number(run.scanId),
    runId: Number(run.id),
    runStatus: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    keyword: normalizedKeyword,
    clientId: Number(run.scan.client.id),
    clientName: run.scan.client.businessName,
    clientAddress: [
      run.scan.client.addressLine1,
      run.scan.client.cityState,
      run.scan.client.postCode,
      run.scan.client.country
    ].filter(Boolean).join(', ') || null,
    averageRank,
    bestRank,
    worstRank,
    totalCoordinates: enrichedResults.length,
    foundCoordinates: rankedCoordinates.length,
    missingCoordinates: enrichedResults.length - rankedCoordinates.length,
    matchedTitle: rankedCoordinates[0]?.matchedTitle ?? null,
    matchedDomain: rankedCoordinates[0]?.matchedDomain ?? null,
    matchedPlaceId: rankedCoordinates[0]?.matchedPlaceId ?? null,
    matchedPhone: rankedCoordinates[0]?.matchedPhone ?? null,
    matchedRating: rankedCoordinates[0]?.matchedRating ?? null,
    competitors,
    coordinates: enrichedResults.map((result) => ({
      id: result.id,
      coordinateLabel: result.coordinateLabel,
      latitude: result.latitude,
      longitude: result.longitude,
      matchedAddress: result.matchedAddress,
      rankAbsolute: result.rankAbsolute,
      rankGroup: result.rankGroup,
      matchedTitle: result.matchedTitle,
      matchedDomain: result.matchedDomain,
      matchedPlaceId: result.matchedPlaceId,
      matchedPhone: result.matchedPhone,
      matchedRating: result.matchedRating,
      apiLogId: result.apiLogId
    })),
    gbpProfile: {
      id: Number(run.scan.gbpProfile.id),
      placeId: run.scan.gbpProfile.placeId,
      title: run.scan.gbpProfile.title,
      address: run.scan.gbpProfile.address,
      website: run.scan.gbpProfile.website,
      gpsCoordinates: run.scan.gbpProfile.gpsCoordinates ?? null
    }
  };
}

async function listScanRunKeywordSummary({ db, scanId, runId, page = 1, limit = 20 }) {
  const keywordsPage = Number(page);
  const keywordsLimit = Number(limit);
  if (!Number.isInteger(keywordsPage) || keywordsPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(keywordsLimit) || keywordsLimit <= 0 || keywordsLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const run = await db.scanRun.findFirst({
    where: {
      id: BigInt(runId),
      scanId: BigInt(scanId)
    },
    include: {
      results: {
        orderBy: [{ keyword: 'asc' }, { id: 'asc' }]
      }
    }
  });

  if (!run) {
    throw new AppError(404, 'NOT_FOUND', 'Scan run not found.');
  }

  const enrichedResults = await enrichMappedScanResults(db, run.results || []);
  const grouped = new Map();

  for (const result of enrichedResults) {
    const key = result.keyword;
    if (!grouped.has(key)) {
      grouped.set(key, {
        keyword: key,
        totalCoordinates: 0,
        foundCoordinates: 0,
        missingCoordinates: 0,
        bestRank: null,
        worstRank: null,
        averageRank: null,
        matchedTitle: null,
        matchedDomain: null,
        matchedPlaceId: null,
        matchedPhone: null,
        matchedRating: null,
        coordinates: []
      });
    }

    const entry = grouped.get(key);
    entry.totalCoordinates += 1;
    entry.coordinates.push({
      id: result.id,
      coordinateLabel: result.coordinateLabel,
      latitude: result.latitude,
      longitude: result.longitude,
      rankAbsolute: result.rankAbsolute,
      rankGroup: result.rankGroup,
      matchedTitle: result.matchedTitle,
      matchedDomain: result.matchedDomain,
      matchedPlaceId: result.matchedPlaceId,
      matchedPhone: result.matchedPhone,
      matchedRating: result.matchedRating,
      apiLogId: result.apiLogId
    });

    if (result.rankAbsolute !== null) {
      entry.foundCoordinates += 1;
      entry.bestRank = entry.bestRank === null ? result.rankAbsolute : Math.min(entry.bestRank, result.rankAbsolute);
      entry.worstRank = entry.worstRank === null ? result.rankAbsolute : Math.max(entry.worstRank, result.rankAbsolute);
      entry.matchedTitle = entry.matchedTitle || result.matchedTitle;
      entry.matchedDomain = entry.matchedDomain || result.matchedDomain;
      entry.matchedPlaceId = entry.matchedPlaceId || result.matchedPlaceId;
      entry.matchedPhone = entry.matchedPhone || result.matchedPhone;
      entry.matchedRating = entry.matchedRating ?? result.matchedRating;
    }
  }

  const summaries = Array.from(grouped.values()).map((entry) => {
    entry.missingCoordinates = entry.totalCoordinates - entry.foundCoordinates;
    const rankedCoordinates = entry.coordinates.filter((item) => item.rankAbsolute !== null);
    if (rankedCoordinates.length) {
      const totalRank = rankedCoordinates.reduce((sum, item) => sum + item.rankAbsolute, 0);
      entry.averageRank = Number((totalRank / rankedCoordinates.length).toFixed(2));
    }
    return entry;
  });

  const total = summaries.length;
  const totalPages = Math.max(1, Math.ceil(total / keywordsLimit));
  const hasPrev = keywordsPage > 1;
  const hasNext = keywordsPage < totalPages;
  const start = (keywordsPage - 1) * keywordsLimit;
  const rows = summaries.slice(start, start + keywordsLimit);

  return {
    keywords: rows,
    pagination: {
      page: keywordsPage,
      limit: keywordsLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? keywordsPage - 1 : null,
      nextPage: hasNext ? keywordsPage + 1 : null
    }
  };
}

async function getScanRunKeywordDetails({ db, scanId, runId }) {
  const run = await db.scanRun.findFirst({
    where: {
      id: BigInt(runId),
      scanId: BigInt(scanId)
    },
    include: {
      scan: {
        include: {
          client: {
            select: {
              id: true,
              businessName: true,
              addressLine1: true,
              cityState: true,
              postCode: true,
              country: true,
              website: true
            }
          },
          gbpProfile: {
            select: {
              id: true,
              placeId: true,
              title: true,
              address: true,
              website: true,
              gpsCoordinates: true
            }
          }
        }
      },
      results: {
        orderBy: { id: 'asc' }
      }
    }
  });

  if (!run) {
    throw new AppError(404, 'NOT_FOUND', 'Scan run not found.');
  }

  return {
    keyword: await buildRunKeywordDetails({ db, run })
  };
}

async function getClientScanComparison({ db, clientId, scanId, limit = 3 }) {
  const runsLimit = Number(limit);
  if (!Number.isInteger(runsLimit) || runsLimit <= 0 || runsLimit > 12) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 12.');
  }

  const scan = await db.scan.findFirst({
    where: {
      id: BigInt(scanId),
      clientId: BigInt(clientId)
    },
    include: {
      _count: {
        select: {
          runs: true
        }
      },
      client: {
        select: {
          id: true,
          businessName: true,
          addressLine1: true,
          cityState: true,
          postCode: true,
          country: true,
          website: true
        }
      },
      gbpProfile: {
        select: {
          id: true,
          placeId: true,
          title: true,
          address: true,
          website: true,
          gpsCoordinates: true
        }
      },
      runs: {
        orderBy: { id: 'desc' },
        take: runsLimit,
        include: {
          results: {
            orderBy: { id: 'asc' }
          },
          scan: {
            include: {
              client: {
                select: {
                  id: true,
                  businessName: true,
                  addressLine1: true,
                  cityState: true,
                  postCode: true,
                  country: true,
                  website: true
                }
              },
              gbpProfile: {
                select: {
                  id: true,
                  placeId: true,
                  title: true,
                  address: true,
                  website: true,
                  gpsCoordinates: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!scan) {
    throw new AppError(404, 'NOT_FOUND', 'Scan not found for this client.');
  }

  const runs = [];

  for (const run of scan.runs) {
    try {
      runs.push(await buildRunKeywordDetails({ db, run }));
    } catch (error) {
      if (error?.statusCode === 404) {
        continue;
      }

      throw error;
    }
  }

  return {
    scan: mapScan({
      ...scan,
      runs: scan.runs.slice(0, 1)
    }),
    comparison: {
      clientId: Number(scan.clientId),
      scanId: Number(scan.id),
      keyword: scan.keyword,
      frequency: scan.frequency,
      repeatTime: scan.repeatTime,
      remainingRuns: scan.remainingRuns == null ? null : Number(scan.remainingRuns),
      startAt: scan.startAt,
      nextRunAt: scan.nextRunAt,
      recurrenceEnabled: Boolean(scan.recurrenceEnabled),
      coverageUnit: scan.coverageUnit,
      coverage: Array.isArray(scan.coveragePoints) ? scan.coveragePoints : [],
      totalRuns: scan._count.runs,
      runs
    }
  };
}

async function listClientLocalRankings({ db, clientId, page = 1, limit = 20 }) {
  const keywordsPage = Number(page);
  const keywordsLimit = Number(limit);
  if (!Number.isInteger(keywordsPage) || keywordsPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(keywordsLimit) || keywordsLimit <= 0 || keywordsLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: {
      id: true,
      businessName: true,
      addressLine1: true,
      cityState: true,
      postCode: true,
      country: true
    }
  });
  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const scans = await db.scan.findMany({
    where: { clientId: BigInt(clientId) },
    select: {
      id: true,
      createdAt: true,
      frequency: true,
      status: true,
      nextRunAt: true,
      _count: {
        select: {
          runs: true
        }
      },
      runs: {
        orderBy: { id: 'desc' },
        take: 2,
        include: {
          results: {
            orderBy: [{ keyword: 'asc' }, { id: 'asc' }]
          }
        }
      }
    },
    orderBy: { id: 'desc' }
  });

  const grouped = new Map();

  function summarizeKeywordResults(results) {
    const groupedResults = new Map();

    for (const result of results) {
      const key = result.keyword;
      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          totalCoordinates: 0,
          foundCoordinates: 0,
          bestRank: null,
          worstRank: null,
          averageRank: null,
          matchedTitle: null,
          matchedDomain: null,
          matchedPlaceId: null,
          matchedPhone: null,
          matchedRating: null,
          coordinates: []
        });
      }

      const entry = groupedResults.get(key);
      entry.totalCoordinates += 1;
      entry.coordinates.push({
        id: result.id,
        coordinateLabel: result.coordinateLabel,
        latitude: result.latitude,
        longitude: result.longitude,
        rankAbsolute: result.rankAbsolute,
        rankGroup: result.rankGroup,
        matchedTitle: result.matchedTitle,
        matchedDomain: result.matchedDomain,
        matchedPlaceId: result.matchedPlaceId,
        matchedPhone: result.matchedPhone,
        matchedRating: result.matchedRating,
        apiLogId: result.apiLogId
      });

      if (result.rankAbsolute !== null) {
        entry.foundCoordinates += 1;
        entry.bestRank = entry.bestRank === null ? result.rankAbsolute : Math.min(entry.bestRank, result.rankAbsolute);
        entry.worstRank = entry.worstRank === null ? result.rankAbsolute : Math.max(entry.worstRank, result.rankAbsolute);
        entry.matchedTitle = entry.matchedTitle || result.matchedTitle;
        entry.matchedDomain = entry.matchedDomain || result.matchedDomain;
        entry.matchedPlaceId = entry.matchedPlaceId || result.matchedPlaceId;
        entry.matchedPhone = entry.matchedPhone || result.matchedPhone;
        entry.matchedRating = entry.matchedRating ?? result.matchedRating;
      }
    }

    return new Map(
      Array.from(groupedResults.entries()).map(([keyword, entry]) => {
        const rankedCoordinates = entry.coordinates.filter((item) => item.rankAbsolute !== null);
        if (rankedCoordinates.length) {
          const totalRank = rankedCoordinates.reduce((sum, item) => sum + item.rankAbsolute, 0);
          entry.averageRank = Number((totalRank / rankedCoordinates.length).toFixed(2));
        }
        entry.missingCoordinates = entry.totalCoordinates - entry.foundCoordinates;
        return [keyword, entry];
      })
    );
  }

  for (const scan of scans) {
    const latestRun = scan.runs[0];
    const previousRun = scan.runs[1] || null;
    if (!latestRun) continue;

    const enrichedResults = await enrichMappedScanResults(db, latestRun.results || []);
    const latestSummary = summarizeKeywordResults(enrichedResults);
    const previousSummary = previousRun
      ? summarizeKeywordResults(await enrichMappedScanResults(db, previousRun.results || []))
      : new Map();

    for (const [keyword, summary] of latestSummary.entries()) {
      const previous = previousSummary.get(keyword) || null;
      grouped.set(`${scan.id}:${keyword}`, {
        scanId: Number(scan.id),
        runId: Number(latestRun.id),
        clientId: Number(client.id),
        clientName: client.businessName,
        clientAddress: [
          client.addressLine1,
          client.cityState,
          client.postCode,
          client.country
        ].filter(Boolean).join(', ') || null,
        keyword,
        dateAdded: scan.createdAt,
        dateOfScan: latestRun.finishedAt || latestRun.startedAt,
        previousScan: previous?.averageRank ?? null,
        latestScan: summary.averageRank ?? null,
        nextSchedule: scan.nextRunAt,
        totalScans: scan._count.runs,
        frequency: scan.frequency
          ? String(scan.frequency || '').toLowerCase()
          : 'one-time',
        scanStatus: scan.status,
        runStatus: latestRun.status,
        totalCoordinates: summary.totalCoordinates,
        foundCoordinates: summary.foundCoordinates,
        missingCoordinates: summary.missingCoordinates,
        bestRank: summary.bestRank,
        worstRank: summary.worstRank,
        averageRank: summary.averageRank,
        matchedTitle: summary.matchedTitle,
        matchedDomain: summary.matchedDomain,
        matchedPlaceId: summary.matchedPlaceId,
        matchedPhone: summary.matchedPhone,
        matchedRating: summary.matchedRating,
        coordinates: summary.coordinates
      });
    }
  }

  const summaries = Array.from(grouped.values());

  const total = summaries.length;
  const totalPages = Math.max(1, Math.ceil(total / keywordsLimit));
  const hasPrev = keywordsPage > 1;
  const hasNext = keywordsPage < totalPages;
  const start = (keywordsPage - 1) * keywordsLimit;
  const rows = summaries.slice(start, start + keywordsLimit);

  return {
    keywords: rows,
    pagination: {
      page: keywordsPage,
      limit: keywordsLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? keywordsPage - 1 : null,
      nextPage: hasNext ? keywordsPage + 1 : null
    }
  };
}

async function getSavedLocalRankingKeywords({ db, clientId, actorUserId }) {
  const key = buildSavedLocalRankingKeywordsKey({
    clientId,
    actorUserId
  });
  const record = await db.appSetting.findUnique({
    where: { key },
    select: { valueJson: true }
  });
  const keywords = parseSavedKeywordsValue(record?.valueJson);

  return {
    clientId: Number(clientId),
    keywords,
    total: keywords.length
  };
}

async function saveLocalRankingKeywords({ db, clientId, actorUserId, payload }) {
  const incomingKeywords = parseStringArray(payload?.keywords, 'keywords');
  const key = buildSavedLocalRankingKeywordsKey({
    clientId,
    actorUserId
  });
  const existingRecord = await db.appSetting.findUnique({
    where: { key },
    select: { valueJson: true }
  });
  const existingKeywords = parseSavedKeywordsValue(existingRecord?.valueJson);
  const keywords = Array.from(new Set([...existingKeywords, ...incomingKeywords]));

  await db.appSetting.upsert({
    where: { key },
    create: {
      key,
      valueJson: keywords
    },
    update: {
      valueJson: keywords
    }
  });

  return {
    clientId: Number(clientId),
    keywords,
    total: keywords.length
  };
}

async function clearSavedLocalRankingKeywords({ db, clientId, actorUserId }) {
  const key = buildSavedLocalRankingKeywordsKey({
    clientId,
    actorUserId
  });

  await db.appSetting.deleteMany({
    where: { key }
  });

  return {
    clientId: Number(clientId),
    cleared: true
  };
}

module.exports = {
  createScan,
  listScans,
  listClientLocalRankings,
  getSavedLocalRankingKeywords,
  saveLocalRankingKeywords,
  clearSavedLocalRankingKeywords,
  getScanById,
  getClientScanById,
  deleteScanById,
  deleteScanKeyword,
  startScanRun,
  executeScanRun,
  listScanRuns,
  getScanRunById,
  listScanRunKeywordSummary,
  getScanRunKeywordDetails,
  getClientScanComparison
};
