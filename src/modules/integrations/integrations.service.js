const crypto = require('crypto');
const { AppError } = require('../../lib/errors');

const DATAFORSEO_ENDPOINTS = {
  rankings: '/v3/serp/google/local_finder/live/advanced',
  mapsCompetitors: '/v3/business_data/google/maps/search/live',
  gbpPostsTaskPost: '/v3/business_data/google/my_business_updates/task_post'
};

const SERPAPI_ENDPOINTS = {
  search: '/search.json'
};

function parseOptionalId(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  return id;
}

function requireString(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }
  return normalized;
}

function optionalString(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function normalizeBusinessType(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item || '').trim()).filter(Boolean);
    return items.length ? items.join(', ') : null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function base64BasicAuth(username, password) {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

async function assertContextExists(db, clientId) {
  if (clientId) {
    const client = await db.client.findUnique({
      where: { id: BigInt(clientId) },
      select: { id: true }
    });
    if (!client) {
      throw new AppError(404, 'NOT_FOUND', 'Client not found.');
    }
  }
}

async function persistExternalApiLog({
  db,
  provider,
  operation,
  cacheNamespace,
  requestHash,
  clientId,
  requestedBy,
  endpoint,
  requestMethod,
  requestPayload,
  responseStatusCode,
  responsePayload,
  isSuccess,
  externalTaskId,
  errorMessage
}) {
  return db.externalApiLog.create({
    data: {
      provider,
      operation,
      cacheNamespace,
      requestHash,
      clientId: clientId ? BigInt(clientId) : null,
      projectId: null,
      requestedBy: requestedBy ? BigInt(requestedBy) : null,
      externalTaskId: externalTaskId || null,
      endpoint,
      requestMethod,
      requestPayload,
      responseStatusCode: responseStatusCode ?? null,
      responsePayload: responsePayload ?? null,
      isSuccess,
      errorMessage: errorMessage || null
    }
  });
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function buildRequestHash(cacheNamespace, requestPayload) {
  const canonical = JSON.stringify(sortValue(requestPayload));
  return crypto.createHash('sha256').update(`${cacheNamespace}:${canonical}`).digest('hex');
}

async function findCachedExternalApiLog({ db, cacheNamespace, requestHash, ttlMinutes }) {
  const since = new Date(Date.now() - ttlMinutes * 60 * 1000);
  return db.externalApiLog.findFirst({
    where: {
      cacheNamespace,
      requestHash,
      isSuccess: true,
      createdAt: { gte: since }
    },
    orderBy: { createdAt: 'desc' }
  });
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractDataForSeoTaskId(responsePayload) {
  const tasks = responsePayload?.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return null;
  return tasks[0]?.id || null;
}

function normalizeDataForSeoItems(payload) {
  const tasks = payload?.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return [];
  return tasks.flatMap((task) => task?.result || []);
}

function normalizeComparableText(value) {
  return String(value || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .trim()
    .toLowerCase();
}

function collectLocalFinderEntries(items) {
  const entries = [];
  for (const block of items) {
    const blockItems = Array.isArray(block?.items) ? block.items : [];
    for (const item of blockItems) {
      if (Array.isArray(item?.items) && item.items.length) {
        entries.push(...item.items);
        continue;
      }
      entries.push(item);
    }
  }
  return entries;
}

function summarizeLocalFinderEntries(items, limit = 5) {
  return collectLocalFinderEntries(items)
    .slice(0, limit)
    .map((item) => ({
      rankAbsolute: item.rank_absolute ?? null,
      rankGroup: item.rank_group ?? null,
      title: item.title ?? item.title_original ?? item.business_name ?? null,
      domain: item.domain ?? null,
      url: item.url ?? null,
      placeId: item.place_id ?? null,
      address: item.address ?? null,
      phone: item.phone ?? null,
      rating: item.rating?.value ?? item.rating ?? null
    }));
}

function findMatchingLocalPackItems(items, targetPlaceId, targetDomain, targetBusinessName) {
  const normalizedPlaceId = String(targetPlaceId || '').trim();
  const normalizedDomain = normalizeComparableText(targetDomain);
  const normalizedBusinessName = normalizeComparableText(targetBusinessName);
  if (!normalizedPlaceId && !normalizedDomain && !normalizedBusinessName) return [];

  const localEntries = collectLocalFinderEntries(items);
  const matches = [];
  for (const item of localEntries) {
    const placeIdMatches = normalizedPlaceId && String(item?.place_id || '').trim() === normalizedPlaceId;
    const itemDomain = normalizeComparableText(item?.domain || item?.url);
    const itemTitle = normalizeComparableText(item?.title || item?.title_original || item?.business_name);
    const domainMatches = normalizedDomain && itemDomain.includes(normalizedDomain);
    const titleMatches = normalizedBusinessName && itemTitle.includes(normalizedBusinessName);
    if (placeIdMatches || domainMatches || titleMatches) {
      matches.push({
        rankAbsolute: item.rank_absolute ?? null,
        rankGroup: item.rank_group ?? null,
        title: item.title ?? item.title_original ?? item.business_name ?? null,
        url: item.url ?? null,
        domain: item.domain ?? null,
        placeId: item.place_id ?? null,
        address: item.address ?? null,
        phone: item.phone ?? null,
        rating: item.rating?.value ?? item.rating ?? null
      });
    }
  }
  return matches;
}

async function postJson(url, options) {
  const response = await fetch(url, options);
  const payload = await readJsonResponse(response);
  return { response, payload };
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const payload = await readJsonResponse(response);
  return { response, payload };
}

function requireDataForSeoConfig(env) {
  if (!env.integrations.dataForSeo.login || !env.integrations.dataForSeo.password) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required.');
  }
}

function requireSerpApiConfig(env) {
  if (!env.integrations.serpApi.apiKey) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'SERPAPI_API_KEY is required.');
  }
}

function extractSerpApiPlaceResult(responsePayload) {
  return responsePayload?.place_results || responsePayload?.local_results?.[0] || null;
}

async function upsertClientGbpProfile({ db, clientId, placeId, dataCid, responsePayload }) {
  if (!clientId) return;

  const placeResult = extractSerpApiPlaceResult(responsePayload);
  const resolvedPlaceId = String(
    placeResult?.place_id || responsePayload?.place_id || placeId || ''
  ).trim();
  if (!resolvedPlaceId) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'SerpApi GBP details response did not include a placeId.');
  }

  const resolvedDataCid = String(
    placeResult?.data_id || responsePayload?.data_id || dataCid || ''
  ).trim() || null;
  const ratingValue = placeResult?.rating ?? null;
  const normalizedRating = ratingValue === null || ratingValue === undefined || ratingValue === ''
    ? null
    : Number(ratingValue);
  const reviewsValue = placeResult?.reviews ?? null;
  const normalizedReviews = reviewsValue === null || reviewsValue === undefined || reviewsValue === ''
    ? null
    : Number(reviewsValue);

  await db.clientGbpProfile.upsert({
    where: { clientId: BigInt(clientId) },
    update: {
      provider: 'SERPAPI',
      placeId: resolvedPlaceId,
      dataCid: resolvedDataCid,
      title: placeResult?.title ?? responsePayload?.title ?? null,
      address: placeResult?.address ?? null,
      phone: placeResult?.phone ?? null,
      website: placeResult?.website ?? null,
      rating: Number.isFinite(normalizedRating) ? normalizedRating : null,
      reviewsCount: Number.isInteger(normalizedReviews) && normalizedReviews >= 0 ? normalizedReviews : null,
      businessType: normalizeBusinessType(placeResult?.type),
      gpsCoordinates: placeResult?.gps_coordinates ?? null,
      hours: placeResult?.hours ?? null,
      rawSnapshot: responsePayload ?? null,
      lastSyncedAt: new Date()
    },
    create: {
      clientId: BigInt(clientId),
      provider: 'SERPAPI',
      placeId: resolvedPlaceId,
      dataCid: resolvedDataCid,
      title: placeResult?.title ?? responsePayload?.title ?? null,
      address: placeResult?.address ?? null,
      phone: placeResult?.phone ?? null,
      website: placeResult?.website ?? null,
      rating: Number.isFinite(normalizedRating) ? normalizedRating : null,
      reviewsCount: Number.isInteger(normalizedReviews) && normalizedReviews >= 0 ? normalizedReviews : null,
      businessType: normalizeBusinessType(placeResult?.type),
      gpsCoordinates: placeResult?.gps_coordinates ?? null,
      hours: placeResult?.hours ?? null,
      rawSnapshot: responsePayload ?? null,
      lastSyncedAt: new Date()
    }
  });
}

async function fetchDataForSeoRankings({ db, env, requestedBy, payload }) {
  requireDataForSeoConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);
  const forceRefresh = parseBooleanLike(payload.forceRefresh);

  const task = {
    keyword: requireString(payload.keyword, 'keyword'),
    language_code: optionalString(payload.languageCode) || 'en',
    device: optionalString(payload.device) || 'desktop',
    os: optionalString(payload.os) || 'windows',
    depth: Number(payload.depth || 20)
  };
  if (payload.locationName) task.location_name = String(payload.locationName).trim();
  if (payload.locationCode) task.location_code = Number(payload.locationCode);
  if (payload.locationCoordinate) task.location_coordinate = String(payload.locationCoordinate).trim();
  if (payload.languageName) task.language_name = String(payload.languageName).trim();

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.rankings}`;
  const requestPayload = [task];
  const cacheNamespace = 'DATAFORSEO_GOOGLE_LOCAL_FINDER_LIVE_ADVANCED';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  if (!forceRefresh) {
    const cached = await findCachedExternalApiLog({
      db,
      cacheNamespace,
      requestHash,
      ttlMinutes: env.integrations.dataForSeo.cacheTtlMinutes
    });
    if (cached) {
      const items = normalizeDataForSeoItems(cached.responsePayload);
      const matchedRankings = findMatchingLocalPackItems(
        items,
        optionalString(payload.targetPlaceId),
        optionalString(payload.targetDomain),
        optionalString(payload.targetBusinessName)
      );
      const topCandidates = summarizeLocalFinderEntries(items);
      return {
        logId: Number(cached.id),
        provider: 'DATAFORSEO',
        operation: 'RANKINGS',
        cached: true,
        matchedRankings,
        topCandidates,
        raw: cached.responsePayload
      };
    }
  }
  const { response, payload: responsePayload } = await postJson(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64BasicAuth(env.integrations.dataForSeo.login, env.integrations.dataForSeo.password)}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  const success = response.ok;
  const log = await persistExternalApiLog({
    db,
    provider: 'DATAFORSEO',
    operation: 'RANKINGS',
    cacheNamespace,
    requestHash,
    clientId,
    requestedBy,
    endpoint,
    requestMethod: 'POST',
    requestPayload,
    responseStatusCode: response.status,
    responsePayload,
    isSuccess: success,
    errorMessage: success ? null : 'DataForSEO rankings request failed.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO rankings request failed.', {
      provider: 'DATAFORSEO',
      operation: 'RANKINGS',
      logId: Number(log.id),
      upstreamStatus: response.status
    });
  }

  const items = normalizeDataForSeoItems(responsePayload);
  const matchedRankings = findMatchingLocalPackItems(
    items,
    optionalString(payload.targetPlaceId),
    optionalString(payload.targetDomain),
    optionalString(payload.targetBusinessName)
  );
  const topCandidates = summarizeLocalFinderEntries(items);

  return {
    logId: Number(log.id),
    provider: 'DATAFORSEO',
    operation: 'RANKINGS',
    cached: false,
    matchedRankings,
    topCandidates,
    raw: responsePayload
  };
}

async function fetchDataForSeoMapsCompetitors({ db, env, requestedBy, payload }) {
  requireDataForSeoConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);

  const task = {
    keyword: requireString(payload.keyword, 'keyword'),
    language_code: optionalString(payload.languageCode) || 'en',
    limit: Number(payload.limit || 20)
  };
  if (payload.locationName) task.location_name = String(payload.locationName).trim();
  if (payload.locationCode) task.location_code = Number(payload.locationCode);
  if (payload.locationCoordinate) task.location_coordinate = String(payload.locationCoordinate).trim();

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.mapsCompetitors}`;
  const requestPayload = [task];
  const cacheNamespace = 'DATAFORSEO_GOOGLE_MAPS_SEARCH_LIVE';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  const cached = await findCachedExternalApiLog({
    db,
    cacheNamespace,
    requestHash,
    ttlMinutes: env.integrations.dataForSeo.cacheTtlMinutes
  });
  if (cached) {
    return {
      logId: Number(cached.id),
      provider: 'DATAFORSEO',
      operation: 'GOOGLE_MAPS_COMPETITORS',
      cached: true,
      raw: cached.responsePayload
    };
  }
  const { response, payload: responsePayload } = await postJson(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64BasicAuth(env.integrations.dataForSeo.login, env.integrations.dataForSeo.password)}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  const success = response.ok;
  const log = await persistExternalApiLog({
    db,
    provider: 'DATAFORSEO',
    operation: 'GOOGLE_MAPS_COMPETITORS',
    cacheNamespace,
    requestHash,
    clientId,
    requestedBy,
    endpoint,
    requestMethod: 'POST',
    requestPayload,
    responseStatusCode: response.status,
    responsePayload,
    isSuccess: success,
    errorMessage: success ? null : 'DataForSEO Google Maps competitors request failed.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO Google Maps competitors request failed.', {
      provider: 'DATAFORSEO',
      operation: 'GOOGLE_MAPS_COMPETITORS',
      logId: Number(log.id),
      upstreamStatus: response.status
    });
  }

  return {
    logId: Number(log.id),
    provider: 'DATAFORSEO',
    operation: 'GOOGLE_MAPS_COMPETITORS',
    cached: false,
    raw: responsePayload
  };
}

async function pollDataForSeoTask(env, taskId) {
  const endpoint = `${env.integrations.dataForSeo.baseUrl}/v3/business_data/google/my_business_updates/task_get/advanced/${taskId}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { response, payload } = await getJson(endpoint, {
      headers: {
        Authorization: `Basic ${base64BasicAuth(env.integrations.dataForSeo.login, env.integrations.dataForSeo.password)}`
      }
    });
    if (!response.ok) {
      return { response, payload, endpoint };
    }
    const tasks = payload?.tasks;
    if (Array.isArray(tasks) && tasks[0]?.result) {
      return { response, payload, endpoint };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { response: null, payload: null, endpoint };
}

async function fetchDataForSeoGbpPosts({ db, env, requestedBy, payload }) {
  requireDataForSeoConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);

  const task = {
    keyword: requireString(payload.keyword, 'keyword'),
    language_code: optionalString(payload.languageCode) || 'en'
  };
  if (payload.locationName) task.location_name = String(payload.locationName).trim();
  if (payload.locationCode) task.location_code = Number(payload.locationCode);

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.gbpPostsTaskPost}`;
  const requestPayload = [task];
  const cacheNamespace = 'DATAFORSEO_GBP_POSTS';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  const cached = await findCachedExternalApiLog({
    db,
    cacheNamespace,
    requestHash,
    ttlMinutes: env.integrations.dataForSeo.cacheTtlMinutes
  });
  if (cached) {
    return {
      logId: Number(cached.id),
      provider: 'DATAFORSEO',
      operation: 'GBP_POSTS',
      externalTaskId: cached.externalTaskId,
      cached: true,
      raw: cached.responsePayload
    };
  }
  const { response, payload: submissionPayload } = await postJson(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64BasicAuth(env.integrations.dataForSeo.login, env.integrations.dataForSeo.password)}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  const externalTaskId = extractDataForSeoTaskId(submissionPayload);
  let responsePayload = { submission: submissionPayload, result: null };
  let success = response.ok;
  let upstreamStatus = response.status;

  if (success && externalTaskId) {
    const poll = await pollDataForSeoTask(env, externalTaskId);
    if (poll.response) {
      upstreamStatus = poll.response.status;
      responsePayload = {
        submission: submissionPayload,
        result: poll.payload
      };
      success = poll.response.ok;
    }
  }

  const log = await persistExternalApiLog({
    db,
    provider: 'DATAFORSEO',
    operation: 'GBP_POSTS',
    cacheNamespace,
    requestHash,
    clientId,
    requestedBy,
    endpoint,
    requestMethod: 'POST',
    requestPayload,
    responseStatusCode: upstreamStatus,
    responsePayload,
    isSuccess: success,
    externalTaskId,
    errorMessage: success ? null : 'DataForSEO GBP posts request failed.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO GBP posts request failed.', {
      provider: 'DATAFORSEO',
      operation: 'GBP_POSTS',
      logId: Number(log.id),
      upstreamStatus
    });
  }

  return {
    logId: Number(log.id),
    provider: 'DATAFORSEO',
    operation: 'GBP_POSTS',
    externalTaskId,
    cached: false,
    raw: responsePayload
  };
}

async function fetchSerpApiGbpDetails({ db, env, requestedBy, payload }) {
  requireSerpApiConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  if (!clientId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clientId is required for GBP details.');
  }
  await assertContextExists(db, clientId);
  const forceRefresh = parseBooleanLike(payload.forceRefresh);
  let storedProfile = null;
  if (clientId) {
    storedProfile = await db.clientGbpProfile.findUnique({
      where: { clientId: BigInt(clientId) },
      select: {
        placeId: true,
        dataCid: true
      }
    });
  }

  const params = new URLSearchParams({
    api_key: env.integrations.serpApi.apiKey,
    engine: 'google_maps',
    hl: optionalString(payload.hl) || 'en',
    gl: optionalString(payload.gl) || 'us'
  });
  const resolvedPlaceId = optionalString(payload.placeId) || storedProfile?.placeId || null;
  const resolvedDataCid = optionalString(payload.dataCid) || storedProfile?.dataCid || null;
  if (resolvedPlaceId) params.set('place_id', resolvedPlaceId);
  if (resolvedDataCid) params.set('data_cid', resolvedDataCid);
  if (payload.ll) params.set('ll', String(payload.ll).trim());
  if (!params.get('place_id') && !params.get('data_cid')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'placeId or dataCid is required, or the client must already have a saved GBP profile.');
  }

  const endpoint = `${env.integrations.serpApi.baseUrl}${SERPAPI_ENDPOINTS.search}?${params.toString()}`;
  const requestPayload = Object.fromEntries(params.entries());
  requestPayload.api_key = '[redacted]';
  const cacheNamespace = 'SERPAPI_GBP_DETAILS';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  if (!forceRefresh) {
    const cached = await findCachedExternalApiLog({
      db,
      cacheNamespace,
      requestHash,
      ttlMinutes: env.integrations.serpApi.cacheTtlMinutes
    });
    if (cached) {
      await upsertClientGbpProfile({
        db,
        clientId,
        placeId: resolvedPlaceId,
        dataCid: resolvedDataCid,
        responsePayload: cached.responsePayload
      });

      const profile = await db.clientGbpProfile.findUnique({
        where: { clientId: BigInt(clientId) },
        select: { id: true, placeId: true, dataCid: true, lastSyncedAt: true }
      });

      return {
        logId: Number(cached.id),
        provider: 'SERPAPI',
        operation: 'GBP_DETAILS',
        cached: true,
        profileSaved: Boolean(profile),
        profileId: profile ? Number(profile.id) : null,
        placeId: profile?.placeId || null,
        dataCid: profile?.dataCid || null,
        lastSyncedAt: profile?.lastSyncedAt || null,
        raw: cached.responsePayload
      };
    }
  }
  const { response, payload: responsePayload } = await getJson(endpoint);
  const success = response.ok;

  const log = await persistExternalApiLog({
    db,
    provider: 'SERPAPI',
    operation: 'GBP_DETAILS',
    cacheNamespace,
    requestHash,
    clientId,
    requestedBy,
    endpoint: `${env.integrations.serpApi.baseUrl}${SERPAPI_ENDPOINTS.search}`,
    requestMethod: 'GET',
    requestPayload,
    responseStatusCode: response.status,
    responsePayload,
    isSuccess: success,
    errorMessage: success ? null : 'SerpApi GBP details request failed.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'SerpApi GBP details request failed.', {
      provider: 'SERPAPI',
      operation: 'GBP_DETAILS',
      logId: Number(log.id),
      upstreamStatus: response.status
    });
  }

  await upsertClientGbpProfile({
    db,
    clientId,
    placeId: resolvedPlaceId,
    dataCid: resolvedDataCid,
    responsePayload
  });

  const profile = await db.clientGbpProfile.findUnique({
    where: { clientId: BigInt(clientId) },
    select: { id: true, placeId: true, dataCid: true, lastSyncedAt: true }
  });

  return {
    logId: Number(log.id),
    provider: 'SERPAPI',
    operation: 'GBP_DETAILS',
    cached: false,
    profileSaved: Boolean(profile),
    profileId: profile ? Number(profile.id) : null,
    placeId: profile?.placeId || null,
    dataCid: profile?.dataCid || null,
    lastSyncedAt: profile?.lastSyncedAt || null,
    raw: responsePayload
  };
}

async function fetchSerpApiReviews({ db, env, requestedBy, payload }) {
  requireSerpApiConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);

  const params = new URLSearchParams({
    api_key: env.integrations.serpApi.apiKey,
    engine: 'google_maps_reviews',
    hl: optionalString(payload.hl) || 'en'
  });
  if (payload.placeId) params.set('place_id', String(payload.placeId).trim());
  if (payload.dataId) params.set('data_id', String(payload.dataId).trim());
  if (payload.nextPageToken) params.set('next_page_token', String(payload.nextPageToken).trim());
  if (payload.sortBy) params.set('sort_by', String(payload.sortBy).trim());
  if (!params.get('place_id') && !params.get('data_id')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'placeId or dataId is required.');
  }

  const endpoint = `${env.integrations.serpApi.baseUrl}${SERPAPI_ENDPOINTS.search}?${params.toString()}`;
  const requestPayload = Object.fromEntries(params.entries());
  requestPayload.api_key = '[redacted]';
  const cacheNamespace = 'SERPAPI_REVIEWS';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  const cached = await findCachedExternalApiLog({
    db,
    cacheNamespace,
    requestHash,
    ttlMinutes: env.integrations.serpApi.cacheTtlMinutes
  });
  if (cached) {
    return {
      logId: Number(cached.id),
      provider: 'SERPAPI',
      operation: 'REVIEWS',
      cached: true,
      raw: cached.responsePayload
    };
  }
  const { response, payload: responsePayload } = await getJson(endpoint);
  const success = response.ok;

  const log = await persistExternalApiLog({
    db,
    provider: 'SERPAPI',
    operation: 'REVIEWS',
    cacheNamespace,
    requestHash,
    clientId,
    requestedBy,
    endpoint: `${env.integrations.serpApi.baseUrl}${SERPAPI_ENDPOINTS.search}`,
    requestMethod: 'GET',
    requestPayload,
    responseStatusCode: response.status,
    responsePayload,
    isSuccess: success,
    errorMessage: success ? null : 'SerpApi reviews request failed.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'SerpApi reviews request failed.', {
      provider: 'SERPAPI',
      operation: 'REVIEWS',
      logId: Number(log.id),
      upstreamStatus: response.status
    });
  }

  return {
    logId: Number(log.id),
    provider: 'SERPAPI',
    operation: 'REVIEWS',
    cached: false,
    raw: responsePayload
  };
}

module.exports = {
  fetchDataForSeoRankings,
  fetchDataForSeoMapsCompetitors,
  fetchDataForSeoGbpPosts,
  fetchSerpApiGbpDetails,
  fetchSerpApiReviews
};
