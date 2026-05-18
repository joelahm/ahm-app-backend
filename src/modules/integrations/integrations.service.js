const crypto = require('crypto');
const { AppError } = require('../../lib/errors');
const anthropicContentService = require('../ai-content/anthropic.service');

const DATAFORSEO_ENDPOINTS = {
  rankings: '/v3/serp/google/local_finder/live/advanced',
  mapsCompetitors: '/v3/business_data/google/maps/search/live',
  gbpPostsTaskPost: '/v3/business_data/google/my_business_updates/task_post',
  keywordOverview: '/v3/dataforseo_labs/google/keyword_overview/live',
  relatedKeywords: '/v3/dataforseo_labs/google/related_keywords/live',
  keywordSuggestions: '/v3/dataforseo_labs/google/keyword_suggestions/live',
  googleAdsLocations: '/v3/keywords_data/google_ads/locations',
  googleAdsLanguages: '/v3/keywords_data/google_ads/languages'
};

const SERPAPI_ENDPOINTS = {
  search: '/search.json'
};

const MANUS_ENDPOINTS = {
  taskCreate: '/v2/task.create',
  taskDetail: '/v2/task.detail',
  taskListMessages: '/v2/task.listMessages'
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

async function persistManusApiLog({
  db,
  operation,
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
  return db.manusApiLog.create({
    data: {
      operation,
      clientId: clientId ? BigInt(clientId) : null,
      requestedBy: requestedBy ? BigInt(requestedBy) : null,
      endpoint,
      requestMethod,
      requestPayload,
      responseStatusCode: responseStatusCode ?? null,
      responsePayload: responsePayload ?? null,
      isSuccess,
      externalTaskId: externalTaskId || null,
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

function extractDataForSeoErrorSummary(responsePayload) {
  const tasks = Array.isArray(responsePayload?.tasks) ? responsePayload.tasks : [];

  for (const task of tasks) {
    const statusCode = task?.status_code;
    const statusMessage = String(task?.status_message || '').trim();
    const customMessage = String(task?.custom_error || '').trim();

    if (statusMessage || customMessage || statusCode) {
      return {
        statusCode: statusCode ?? null,
        statusMessage: statusMessage || null,
        customMessage: customMessage || null
      };
    }
  }

  const rootStatusCode = responsePayload?.status_code;
  const rootStatusMessage = String(responsePayload?.status_message || '').trim();
  if (rootStatusCode || rootStatusMessage) {
    return {
      statusCode: rootStatusCode ?? null,
      statusMessage: rootStatusMessage || null,
      customMessage: null
    };
  }

  return null;
}

function normalizeDataForSeoItems(payload) {
  const tasks = payload?.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return [];
  return tasks.flatMap((task) => task?.result || []);
}

function normalizeKeywordResearchLocationName(value) {
  return String(value || '').trim().toLowerCase();
}


function mapGoogleAdsLocationRow(item) {
  const locationCode = Number(item?.location_code);
  const locationName = String(item?.location_name || '').trim();
  if (!Number.isInteger(locationCode) || locationCode <= 0 || !locationName) {
    return null;
  }

  const locationCodeParent = item?.location_code_parent === undefined || item?.location_code_parent === null || item?.location_code_parent === ''
    ? null
    : Number(item.location_code_parent);
  const countryIsoCode = String(item?.country_iso_code || '').trim() || null;
  const locationType = String(item?.location_type || '').trim() || null;

  return {
    locationCode,
    locationName,
    locationCodeParent: Number.isInteger(locationCodeParent) && locationCodeParent > 0
      ? locationCodeParent
      : null,
    countryIsoCode,
    locationType,
    rawData: item,
  };
}

function mapGoogleAdsLanguageRow(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const languageCode = String(item?.language_code || '').trim();
  const languageName = String(item?.language_name || '').trim();

  if (!languageCode || !languageName) {
    return null;
  }

  return {
    languageCode,
    languageName,
    rawData: item,
  };
}

async function syncDataForSeoGoogleAdsLocations({ db, env, requestedBy, forceRefresh = false }) {
  requireDataForSeoConfig(env);

  const existingCount = await db.dataForSeoGoogleAdsLocation.count();
  if (existingCount > 0 && !forceRefresh) {
    return {
      synced: false,
      totalLocations: existingCount,
    };
  }

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.googleAdsLocations}`;
  const requestPayload = [];
  const { response, payload: responsePayload } = await getJson(endpoint, {
    headers: {
      Authorization: `Basic ${base64BasicAuth(env.integrations.dataForSeo.login, env.integrations.dataForSeo.password)}`
    }
  });

  const success = response.ok;
  try {
    await persistExternalApiLog({
      db,
      provider: 'DATAFORSEO',
      operation: 'GOOGLE_ADS_LOCATIONS_SYNC',
      cacheNamespace: 'DATAFORSEO_GOOGLE_ADS_LOCATIONS_SYNC',
      requestHash: buildRequestHash('DATAFORSEO_GOOGLE_ADS_LOCATIONS_SYNC', requestPayload),
      clientId: null,
      requestedBy,
      endpoint,
      requestMethod: 'GET',
      requestPayload,
      responseStatusCode: response.status,
      responsePayload,
      isSuccess: success,
      errorMessage: success ? null : 'DataForSEO Google Ads locations request failed.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Logging should never block the sync operation.
    console.warn('[integrations] failed to persist GOOGLE_ADS_LOCATIONS_SYNC log:', message);
  }

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO Google Ads locations request failed.', {
      provider: 'DATAFORSEO',
      operation: 'GOOGLE_ADS_LOCATIONS_SYNC',
      upstreamStatus: response.status
    });
  }

  const rows = normalizeDataForSeoItems(responsePayload)
    .map(mapGoogleAdsLocationRow)
    .filter(Boolean);

  await db.$transaction([
    db.dataForSeoGoogleAdsLocation.deleteMany(),
    db.dataForSeoGoogleAdsLocation.createMany({
      data: rows,
      skipDuplicates: true,
    }),
  ]);

  return {
    synced: true,
    totalLocations: rows.length,
  };
}

async function syncDataForSeoGoogleAdsLanguages({ db, env, requestedBy, forceRefresh = false }) {
  requireDataForSeoConfig(env);

  const existingCount = await db.dataForSeoGoogleAdsLanguage.count();
  if (existingCount > 0 && !forceRefresh) {
    return {
      synced: false,
      totalLanguages: existingCount,
    };
  }

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.googleAdsLanguages}`;
  const requestPayload = [];
  const { response, payload: responsePayload } = await getJson(endpoint, {
    headers: {
      Authorization: `Basic ${base64BasicAuth(env.integrations.dataForSeo.login, env.integrations.dataForSeo.password)}`
    }
  });

  const success = response.ok;
  try {
    await persistExternalApiLog({
      db,
      provider: 'DATAFORSEO',
      operation: 'GOOGLE_ADS_LANGUAGES_SYNC',
      cacheNamespace: 'DATAFORSEO_GOOGLE_ADS_LANGUAGES_SYNC',
      requestHash: buildRequestHash('DATAFORSEO_GOOGLE_ADS_LANGUAGES_SYNC', requestPayload),
      clientId: null,
      requestedBy,
      endpoint,
      requestMethod: 'GET',
      requestPayload,
      responseStatusCode: response.status,
      responsePayload,
      isSuccess: success,
      errorMessage: success ? null : 'DataForSEO Google Ads languages request failed.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Logging should never block the sync operation.
    console.warn('[integrations] failed to persist GOOGLE_ADS_LANGUAGES_SYNC log:', message);
  }

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO Google Ads languages request failed.', {
      provider: 'DATAFORSEO',
      operation: 'GOOGLE_ADS_LANGUAGES_SYNC',
      upstreamStatus: response.status
    });
  }

  const rows = normalizeDataForSeoItems(responsePayload)
    .map(mapGoogleAdsLanguageRow)
    .filter(Boolean);

  await db.$transaction([
    db.dataForSeoGoogleAdsLanguage.deleteMany(),
    db.dataForSeoGoogleAdsLanguage.createMany({
      data: rows,
      skipDuplicates: true,
    }),
  ]);

  return {
    synced: true,
    totalLanguages: rows.length,
  };
}

async function ensureDataForSeoGoogleAdsLocations({ db, env, requestedBy }) {
  const count = await db.dataForSeoGoogleAdsLocation.count();
  if (count > 0) {
    return count;
  }

  const result = await syncDataForSeoGoogleAdsLocations({ db, env, requestedBy });
  return result.totalLocations;
}

async function ensureDataForSeoGoogleAdsLanguages({ db, env, requestedBy }) {
  const count = await db.dataForSeoGoogleAdsLanguage.count();
  if (count > 0) {
    return count;
  }

  const result = await syncDataForSeoGoogleAdsLanguages({ db, env, requestedBy });
  return result.totalLanguages;
}

async function syncDataForSeoGoogleAdsReferenceData({ db, env, requestedBy, forceRefresh = false }) {
  const [locations, languages] = await Promise.all([
    syncDataForSeoGoogleAdsLocations({ db, env, requestedBy, forceRefresh }),
    syncDataForSeoGoogleAdsLanguages({ db, env, requestedBy, forceRefresh }),
  ]);

  return {
    languages,
    locations,
  };
}

async function listDataForSeoKeywordLanguages({ db, env, requestedBy }) {
  const languages = await db.dataForSeoGoogleAdsLanguage.findMany({
    orderBy: { languageName: 'asc' },
    select: {
      languageCode: true,
      languageName: true,
    },
  });

  return {
    languages: languages.map((item) => ({
      label: item.languageName,
      value: item.languageCode,
    })),
  };
}

async function listDataForSeoKeywordCountries({ db, env, requestedBy }) {
  const countries = await db.dataForSeoGoogleAdsLocation.findMany({
    where: {
      locationCodeParent: null,
      countryIsoCode: { not: null },
    },
    orderBy: { locationName: 'asc' },
    select: {
      countryIsoCode: true,
      locationCode: true,
      locationName: true,
    },
  });

  return {
    countries: countries
      .filter((item) => item.countryIsoCode)
      .map((item) => ({
        label: item.locationName,
        locationCode: item.locationCode,
        value: item.countryIsoCode,
      })),
  };
}

async function listDataForSeoKeywordRegions({ db, env, requestedBy, payload }) {
  const countryIsoCode = requireString(payload.countryIsoCode, 'countryIsoCode');
  const query = optionalString(payload.query);

  const regions = await db.dataForSeoGoogleAdsLocation.findMany({
    where: {
      countryIsoCode,
      locationCodeParent: { not: null },
      ...(query
        ? {
            locationName: { contains: query },
          }
        : {}),
    },
    orderBy: { locationName: 'asc' },
    take: 50,
    select: {
      locationCode: true,
      locationName: true,
      locationType: true,
    },
  });

  return {
    regions: regions.map((item) => ({
      label: item.locationName,
      locationCode: item.locationCode,
      locationType: item.locationType,
      value: item.locationName,
    })),
  };
}

async function resolveKeywordResearchLocation({ db, env, requestedBy, payload }) {
  const locationCode = payload.locationCode === undefined || payload.locationCode === null || payload.locationCode === ''
    ? null
    : Number(payload.locationCode);
  if (Number.isInteger(locationCode) && locationCode > 0) {
    return { location_code: locationCode };
  }

  const countryIsoCode = optionalString(payload.countryIsoCode);
  if (!countryIsoCode) {
    return {};
  }

  const countryMatch = await db.dataForSeoGoogleAdsLocation.findFirst({
    where: {
      countryIsoCode,
      locationCodeParent: null,
    },
    select: { locationCode: true },
  });
  if (countryMatch?.locationCode) {
    return { location_code: countryMatch.locationCode };
  }

  return {};
}

function formatKeywordResearchLabel(value) {
  return String(value || '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeKeywordResearchItems(responsePayload) {
  const tasks = responsePayload?.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return [];

  return tasks.flatMap((task) => {
    const results = Array.isArray(task?.result) ? task.result : [];
    const nestedItems = results.flatMap((result) =>
      Array.isArray(result?.items) ? result.items : []
    );

    if (nestedItems.length) {
      return nestedItems;
    }

    return results.filter((result) => result?.keyword || result?.keyword_data?.keyword);
  });
}

function mapKeywordResearchRows(responsePayload) {
  return normalizeKeywordResearchItems(responsePayload)
    .map((item, index) => {
      const keyword = item?.keyword || item?.keyword_data?.keyword || null;
      if (!keyword) return null;

      const keywordInfo = item?.keyword_info || item?.keyword_data?.keyword_info || {};
      const keywordProperties = item?.keyword_properties || item?.keyword_data?.keyword_properties || {};
      const searchIntentInfo = item?.search_intent_info || item?.keyword_data?.search_intent_info || {};
      const serpInfo = item?.serp_info || item?.keyword_data?.serp_info || {};
      const mainIntent = searchIntentInfo?.main_intent
        ? formatKeywordResearchLabel(searchIntentInfo.main_intent)
        : null;
      const foreignIntent = Array.isArray(searchIntentInfo?.foreign_intent)
        ? searchIntentInfo.foreign_intent.map(formatKeywordResearchLabel)
        : [];
      const serpItemTypes = Array.isArray(serpInfo?.serp_item_types)
        ? serpInfo.serp_item_types
        : [];
      const searchVolume = Number(keywordInfo?.search_volume);
      const keywordDifficulty = Number(keywordProperties?.keyword_difficulty);
      const cpc = Number(keywordInfo?.cpc);

      return {
        id: `${String(keyword).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
        keyword,
        searchVolume: Number.isFinite(searchVolume) ? searchVolume : null,
        kd: Number.isFinite(keywordDifficulty) ? keywordDifficulty : null,
        intent: [mainIntent, ...foreignIntent].filter(Boolean).join(', ') || null,
        serp: serpItemTypes.length
          ? formatKeywordResearchLabel(serpItemTypes[0])
          : null,
        cpc: Number.isFinite(cpc) ? cpc : null
      };
    })
    .filter(Boolean);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireDataForSeoConfig(env) {
  if (!env.integrations.dataForSeo.login || !env.integrations.dataForSeo.password) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'DATAFORSEO_LOGIN && DATAFORSEO_PASSWORD are required.');
  }
}

function requireSerpApiConfig(env) {
  if (!env.integrations.serpApi.apiKey) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'SERPAPI_API_KEY is required.');
  }
}

function requireOpenAiConfig(env) {
  if (!env.integrations.openai?.apiKey) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'OPENAI_API_KEY is required.');
  }
}

function requireManusConfig(env) {
  if (!env.integrations.manus?.apiKey) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'MANUS_API_KEY is required.');
  }
}

function normalizeAiProvider(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'OPENAI' || normalized === 'ANTHROPIC') {
    return normalized;
  }

  return 'MANUS';
}

function extractManusAssistantText(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const match = messages.find((message) =>
    String(message?.assistant_message?.content || '').trim()
  );
  return String(match?.assistant_message?.content || '').trim() || null;
}

function extractOpenAiText(payload) {
  const directOutputText = String(payload?.output_text || '').trim();
  if (directOutputText) return directOutputText;

  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const output of outputs) {
    const contents = Array.isArray(output?.content) ? output.content : [];
    for (const content of contents) {
      const text = String(content?.text || '').trim();
      if (text) return text;
    }
  }

  return null;
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


async function fetchDataForSeoSimilarKeywords({ db, env, requestedBy, payload }) {
  requireDataForSeoConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);
  const forceRefresh = parseBooleanLike(payload.forceRefresh);

  const includeSerpInfo = parseBooleanLike(payload.includeSerpInfo);
  const task = {
    keyword: requireString(payload.keyword, 'keyword'),
    language_code: optionalString(payload.languageCode) || 'en',
    include_serp_info: includeSerpInfo,
    limit: Number(payload.limit || 100)
  };
  Object.assign(
    task,
    await resolveKeywordResearchLocation({ db, env, requestedBy, payload })
  );
  if (payload.languageName) task.language_name = String(payload.languageName).trim();

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.relatedKeywords}`;
  const requestPayload = [task];
  const cacheNamespace = 'DATAFORSEO_LABS_RELATED_KEYWORDS';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  if (!forceRefresh) {
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
        operation: 'RELATED_KEYWORDS',
        cached: true,
        keywords: mapKeywordResearchRows(cached.responsePayload),
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
    operation: 'RELATED_KEYWORDS',
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
    errorMessage: success ? null : 'DataForSEO related keywords request failed.'
  });

  if (!success) {
    const upstreamError = extractDataForSeoErrorSummary(responsePayload);
    const upstreamMessage = upstreamError?.customMessage || upstreamError?.statusMessage || null;

    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO related keywords request failed.', {
      provider: 'DATAFORSEO',
      operation: 'RELATED_KEYWORDS',
      logId: Number(log.id),
      upstreamStatus: response.status,
      upstreamMessage,
      upstreamError
    });
  }

  return {
    logId: Number(log.id),
    provider: 'DATAFORSEO',
    operation: 'RELATED_KEYWORDS',
    cached: false,
    keywords: mapKeywordResearchRows(responsePayload),
    raw: responsePayload
  };
}

async function fetchDataForSeoKeywordOverview({ db, env, requestedBy, payload }) {
  requireDataForSeoConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);
  const forceRefresh = parseBooleanLike(payload.forceRefresh);

  const rawKeywords = Array.isArray(payload.keywords) ? payload.keywords : [];
  const keywords = rawKeywords
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (!keywords.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywords is required and must contain at least one keyword.');
  }
  if (keywords.length > 700) {
    throw new AppError(400, 'VALIDATION_ERROR', 'keywords can contain up to 700 items.');
  }

  const locationCodeInput = payload.locationCode === undefined || payload.locationCode === null || payload.locationCode === ''
    ? null
    : Number(payload.locationCode);
  const countryIsoCodeInput = optionalString(payload.countryIsoCode);
  if (!(Number.isInteger(locationCodeInput) && locationCodeInput > 0) && !countryIsoCodeInput) {
    throw new AppError(400, 'VALIDATION_ERROR', 'locationCode or countryIsoCode is required.');
  }

  const languageCodeInput = optionalString(payload.languageCode);
  const languageNameInput = optionalString(payload.languageName);
  if (!languageCodeInput && !languageNameInput) {
    throw new AppError(400, 'VALIDATION_ERROR', 'languageCode or languageName is required.');
  }

  const task = {
    keywords: keywords.slice(0, 700),
    language_code: languageCodeInput || undefined
  };
  if (!task.language_code && languageNameInput) {
    task.language_name = languageNameInput;
  }
  Object.assign(
    task,
    await resolveKeywordResearchLocation({ db, env, requestedBy, payload })
  );

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.keywordOverview}`;
  const requestPayload = [task];
  const cacheNamespace = 'DATAFORSEO_LABS_KEYWORD_OVERVIEW';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  if (!forceRefresh) {
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
        operation: 'KEYWORD_OVERVIEW',
        cached: true,
        keywords: mapKeywordResearchRows(cached.responsePayload),
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
    operation: 'KEYWORD_OVERVIEW',
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
    errorMessage: success ? null : 'DataForSEO keyword overview request failed.'
  });

  if (!success) {
    const isPaymentRequired = response.status === 402;

    throw new AppError(
      isPaymentRequired ? 402 : 502,
      isPaymentRequired ? 'UPSTREAM_PAYMENT_REQUIRED' : 'UPSTREAM_API_ERROR',
      isPaymentRequired
        ? 'DataForSEO keyword overview request failed because the account has insufficient credits or billing access.'
        : 'DataForSEO keyword overview request failed.',
      {
      provider: 'DATAFORSEO',
      operation: 'KEYWORD_OVERVIEW',
      logId: Number(log.id),
      upstreamStatus: response.status
      }
    );
  }

  return {
    logId: Number(log.id),
    provider: 'DATAFORSEO',
    operation: 'KEYWORD_OVERVIEW',
    cached: false,
    keywords: mapKeywordResearchRows(responsePayload),
    raw: responsePayload
  };
}

async function fetchDataForSeoKeywordSuggestions({ db, env, requestedBy, payload }) {
  requireDataForSeoConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);
  const forceRefresh = parseBooleanLike(payload.forceRefresh);

  const task = {
    keyword: requireString(payload.keyword, 'keyword'),
    language_code: optionalString(payload.languageCode) || 'en',
    include_serp_info: true,
    include_seed_keyword: false,
    limit: Number(payload.limit || 100)
  };
  Object.assign(
    task,
    await resolveKeywordResearchLocation({ db, env, requestedBy, payload })
  );
  if (payload.languageName) task.language_name = String(payload.languageName).trim();

  const endpoint = `${env.integrations.dataForSeo.baseUrl}${DATAFORSEO_ENDPOINTS.keywordSuggestions}`;
  const requestPayload = [task];
  const cacheNamespace = 'DATAFORSEO_LABS_KEYWORD_SUGGESTIONS';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  if (!forceRefresh) {
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
        operation: 'KEYWORD_SUGGESTIONS',
        cached: true,
        keywords: mapKeywordResearchRows(cached.responsePayload),
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
    operation: 'KEYWORD_SUGGESTIONS',
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
    errorMessage: success ? null : 'DataForSEO keyword suggestions request failed.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'DataForSEO keyword suggestions request failed.', {
      provider: 'DATAFORSEO',
      operation: 'KEYWORD_SUGGESTIONS',
      logId: Number(log.id),
      upstreamStatus: response.status
    });
  }

  return {
    logId: Number(log.id),
    provider: 'DATAFORSEO',
    operation: 'KEYWORD_SUGGESTIONS',
    cached: false,
    keywords: mapKeywordResearchRows(responsePayload),
    raw: responsePayload
  };
}

async function fetchSerpApiGbpDetails({ db, env, requestedBy, payload }) {
  requireSerpApiConfig(env);

  const clientId = parseOptionalId(payload.clientId, 'clientId');
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
      if (clientId) {
        await upsertClientGbpProfile({
          db,
          clientId,
          placeId: resolvedPlaceId,
          dataCid: resolvedDataCid,
          responsePayload: cached.responsePayload
        });
      }

      const profile = clientId
        ? await db.clientGbpProfile.findUnique({
          where: { clientId: BigInt(clientId) },
          select: { id: true, placeId: true, dataCid: true, lastSyncedAt: true }
        })
        : null;

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

  if (clientId) {
    await upsertClientGbpProfile({
      db,
      clientId,
      placeId: resolvedPlaceId,
      dataCid: resolvedDataCid,
      responsePayload
    });
  }

  const profile = clientId
    ? await db.clientGbpProfile.findUnique({
      where: { clientId: BigInt(clientId) },
      select: { id: true, placeId: true, dataCid: true, lastSyncedAt: true }
    })
    : null;

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
  const dataId = String(payload.dataId || '').trim();
  const placeId = String(payload.placeId || '').trim();
  if (dataId) {
    params.set('data_id', dataId);
  } else if (placeId) {
    params.set('place_id', placeId);
  }
  if (payload.nextPageToken) params.set('next_page_token', String(payload.nextPageToken).trim());
  if (payload.sortBy) params.set('sort_by', String(payload.sortBy).trim());
  if (!params.get('place_id') && !params.get('data_id')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'placeId or dataId is required.');
  }
  const forceRefresh = parseBooleanLike(payload.forceRefresh);

  const endpoint = `${env.integrations.serpApi.baseUrl}${SERPAPI_ENDPOINTS.search}?${params.toString()}`;
  const requestPayload = Object.fromEntries(params.entries());
  requestPayload.api_key = '[redacted]';
  const cacheNamespace = 'SERPAPI_REVIEWS';
  const requestHash = buildRequestHash(cacheNamespace, requestPayload);
  if (!forceRefresh) {
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

async function fetchOpenAiGeneratedText({ db, env, requestedBy, clientId, prompt, maxCharacters = null, auditContext = null }) {
  requireOpenAiConfig(env);

  const operation = 'GENERATE_TEXT';
  const endpoint = `${env.integrations.openai.baseUrl}/v1/responses`;
  const requestPayload = {
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    max_output_tokens: Number(maxCharacters || env.integrations.openai.maxOutputTokens || 120),
    model: env.integrations.openai.model,
  };

  const { response, payload: responsePayload } = await postJson(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.integrations.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  });

  const outputText = extractOpenAiText(responsePayload);
  const success = response.ok && Boolean(outputText);
  const externalTaskId = String(responsePayload?.id || '').trim() || null;

  const log = await persistManusApiLog({
    db,
    operation: `OPENAI_${operation}`,
    clientId,
    requestedBy,
    endpoint,
    requestMethod: 'POST',
    requestPayload: {
      ...requestPayload,
      auditContext,
      // Keep logs lighter and avoid persisting the full prompt repeatedly.
      input: '[redacted]',
    },
    responseStatusCode: response.status,
    responsePayload,
    isSuccess: success,
    externalTaskId,
    errorMessage: success ? null : 'OpenAI did not return assistant content.',
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'OpenAI did not return assistant content.', {
      provider: 'OPENAI',
      operation,
      logId: Number(log.id),
      upstreamStatus: response.status,
      externalTaskId,
    });
  }

  return {
    logId: Number(log.id),
    provider: 'OPENAI',
    operation,
    taskId: externalTaskId,
    text: outputText,
  };
}

async function fetchAnthropicGeneratedText({ db, env, requestedBy, clientId, prompt, maxCharacters = null, model = null, auditContext = null, layoutImageUrl = null }) {
  const operation = 'GENERATE_TEXT';
  const endpoint = `${String(env.integrations.anthropic?.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`;
  const resolvedModel = optionalString(model) || env.integrations.anthropic?.model || null;
  const requestPayload = {
    maxOutputTokens: Number(maxCharacters || env.integrations.anthropic?.maxOutputTokens || 4096),
    model: resolvedModel,
    prompt,
    layoutImageUrl: optionalString(layoutImageUrl) || null,
  };

  try {
    const generated = await anthropicContentService.generateMedicalWebsiteContent({
      env,
      maxOutputTokens: requestPayload.maxOutputTokens,
      model: resolvedModel,
      prompt,
      layoutImageUrl: requestPayload.layoutImageUrl,
    });

    const log = await persistManusApiLog({
      db,
      operation: `ANTHROPIC_${operation}`,
      clientId,
      requestedBy,
      endpoint,
      requestMethod: 'POST',
      requestPayload: {
        ...requestPayload,
        auditContext,
        prompt: '[redacted]',
      },
      responseStatusCode: 200,
      responsePayload: {
        model: generated.model,
        stopReason: generated.stopReason,
        usage: generated.usage,
      },
      isSuccess: true,
      externalTaskId: null,
      errorMessage: null,
    });

    return {
      logId: Number(log.id),
      operation,
      provider: 'ANTHROPIC',
      taskId: null,
      text: generated.text,
      usage: generated.usage,
    };
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 502;
    const code = error instanceof AppError ? error.code : 'UPSTREAM_API_ERROR';
    const message = error instanceof Error ? error.message : 'Anthropic request failed.';
    const details = error instanceof AppError ? error.details : null;

    const log = await persistManusApiLog({
      db,
      operation: `ANTHROPIC_${operation}`,
      clientId,
      requestedBy,
      endpoint,
      requestMethod: 'POST',
      requestPayload: {
        ...requestPayload,
        auditContext,
        prompt: '[redacted]',
      },
      responseStatusCode: details?.upstreamStatus ?? null,
      responsePayload: details,
      isSuccess: false,
      externalTaskId: null,
      errorMessage: message,
    });

    throw new AppError(statusCode, code, message, {
      ...(details || {}),
      logId: Number(log.id),
      provider: 'ANTHROPIC',
    });
  }
}

async function fetchManusGeneratedText({ db, env, requestedBy, payload }) {
  const clientId = parseOptionalId(payload.clientId, 'clientId');
  await assertContextExists(db, clientId);

  const prompt = requireString(payload.prompt, 'prompt');
  const provider = normalizeAiProvider(payload.provider || env.integrations.aiTitleProvider);
  const maxCharacters = payload.maxCharacters ? Number(payload.maxCharacters) : null;
  const model = optionalString(payload.model) || null;
  const auditContext =
    payload.auditContext && typeof payload.auditContext === 'object' && !Array.isArray(payload.auditContext)
      ? payload.auditContext
      : null;

  if (provider === 'OPENAI') {
    return fetchOpenAiGeneratedText({
      db,
      env,
      requestedBy,
      clientId,
      prompt,
      maxCharacters,
      model,
      auditContext,
    });
  }

  if (provider === 'ANTHROPIC') {
    return fetchAnthropicGeneratedText({
      db,
      env,
      requestedBy,
      clientId,
      prompt,
      maxCharacters,
      auditContext,
      layoutImageUrl: optionalString(payload.layoutImageUrl) || null,
    });
  }

  requireManusConfig(env);

  const locale = optionalString(payload.locale) || 'en';
  const agentProfile = optionalString(payload.agentProfile) || 'manus-1.6';
  const pollIntervalMs = Number(env.integrations.manus.pollIntervalMs || 1500);
  const maxPollAttempts = Number(env.integrations.manus.maxPollAttempts || 80);
  const operation = 'GENERATE_TEXT';

  const createEndpoint = `${env.integrations.manus.baseUrl}${MANUS_ENDPOINTS.taskCreate}`;
  const createRequestPayload = {
    agent_profile: agentProfile,
    interactive_mode: false,
    locale,
    message: {
      content: [{ type: 'text', text: prompt }]
    }
  };
  const { response: createResponse, payload: createPayload } = await postJson(createEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-manus-api-key': env.integrations.manus.apiKey
    },
    body: JSON.stringify(createRequestPayload)
  });

  const taskId = createPayload?.task_id || null;

  if (!createResponse.ok || !createPayload?.ok || !taskId) {
    const log = await persistManusApiLog({
      db,
      operation: `MANUS_${operation}`,
      clientId,
      requestedBy,
      endpoint: createEndpoint,
      requestMethod: 'POST',
      requestPayload: { ...createRequestPayload, auditContext },
      responseStatusCode: createResponse.status,
      responsePayload: createPayload,
      isSuccess: false,
      externalTaskId: taskId,
      errorMessage: createPayload?.error?.message || 'Manus task creation failed.'
    });

    throw new AppError(502, 'UPSTREAM_API_ERROR', 'Manus task creation failed.', {
      provider: 'MANUS',
      operation,
      logId: Number(log.id),
      upstreamStatus: createResponse.status
    });
  }

  let lastDetailPayload = null;
  let status = 'running';
  let detailStatusCode = null;
  let transientNotFoundCount = 0;

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const detailEndpoint = `${env.integrations.manus.baseUrl}${MANUS_ENDPOINTS.taskDetail}?task_id=${encodeURIComponent(taskId)}`;
    const { response: detailResponse, payload: detailPayload } = await getJson(detailEndpoint, {
      method: 'GET',
      headers: {
        'x-manus-api-key': env.integrations.manus.apiKey
      }
    });

    lastDetailPayload = detailPayload;
    detailStatusCode = detailResponse.status;

    if (!detailResponse.ok || !detailPayload?.ok || !detailPayload?.task?.status) {
      // Manus can return task not found for a short period after task.create.
      const isTransientNotFound = detailResponse.status === 404
        && String(detailPayload?.error?.code || '').trim().toLowerCase() === 'not_found';
      if (isTransientNotFound) {
        transientNotFoundCount += 1;
        if (transientNotFoundCount < maxPollAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          continue;
        }
      }
      break;
    }

    status = String(detailPayload.task.status || '').trim().toLowerCase();
    if (status === 'completed') {
      break;
    }
    if (status === 'failed' || status === 'stopped' || status === 'pending') {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const messagesEndpoint = `${env.integrations.manus.baseUrl}${MANUS_ENDPOINTS.taskListMessages}?task_id=${encodeURIComponent(taskId)}&order=desc&limit=50`;
  const { response: messagesResponse, payload: messagesPayload } = await getJson(messagesEndpoint, {
    method: 'GET',
    headers: {
      'x-manus-api-key': env.integrations.manus.apiKey
    }
  });

  const assistantText = extractManusAssistantText(messagesPayload);
  const success = messagesResponse.ok && messagesPayload?.ok && Boolean(assistantText);

  if (status !== 'completed' && !success) {
    const log = await persistManusApiLog({
      db,
      operation: `MANUS_${operation}`,
      clientId,
      requestedBy,
      endpoint: `${env.integrations.manus.baseUrl}${MANUS_ENDPOINTS.taskDetail}`,
      requestMethod: 'GET',
      requestPayload: { task_id: taskId, maxPollAttempts, pollIntervalMs },
      responseStatusCode: detailStatusCode,
      responsePayload: lastDetailPayload,
      isSuccess: false,
      externalTaskId: taskId,
      errorMessage: `Manus task did not complete in time. Final status: ${status || 'unknown'}.`
    });

    throw new AppError(
      504,
      'UPSTREAM_TIMEOUT',
      `Manus task is still running. Try again in a few seconds. Task: ${taskId}`,
      {
        provider: 'MANUS',
        operation,
        logId: Number(log.id),
        externalTaskId: taskId,
        finalStatus: status || 'unknown',
      }
    );
  }

  const log = await persistManusApiLog({
    db,
    operation: `MANUS_${operation}`,
    clientId,
    requestedBy,
    endpoint: `${env.integrations.manus.baseUrl}${MANUS_ENDPOINTS.taskListMessages}`,
    requestMethod: 'GET',
    requestPayload: { task_id: taskId, order: 'desc', limit: 50 },
    responseStatusCode: messagesResponse.status,
    responsePayload: messagesPayload,
    isSuccess: success,
    externalTaskId: taskId,
    errorMessage: success ? null : 'Manus did not return assistant content.'
  });

  if (!success) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'Manus did not return assistant content.', {
      provider: 'MANUS',
      operation,
      logId: Number(log.id),
      externalTaskId: taskId
    });
  }

  return {
    logId: Number(log.id),
    provider: 'MANUS',
    operation,
    taskId,
    text: assistantText
  };
}

// ============================================================================
// Multi-provider keyword research orchestrator
// ----------------------------------------------------------------------------
// Each provider implements a fetch function that returns
// { provider, ok: true/false, keywords: [{ keyword, searchVolume, kd, cpc,
// intent, serp }] }. The orchestrator fans out to all enabled providers via
// Promise.allSettled so a single provider failure does not block the others,
// then merges per-keyword averaging numeric metrics and tagging each row
// with the provider initials that contributed.
// ============================================================================

const KEYWORD_PROVIDER_KEYS = ['DATAFORSEO', 'SE_RANKING'];

function normalizeProvidersInput(value, env) {
  const fallback = (() => {
    const candidate = String(
      env?.integrations?.keywordResearchDefaultProvider || 'SE_RANKING',
    )
      .trim()
      .toUpperCase();

    return KEYWORD_PROVIDER_KEYS.includes(candidate) ? candidate : 'SE_RANKING';
  })();

  if (!Array.isArray(value) || value.length === 0) {
    return [fallback];
  }

  const upperCased = value
    .map((entry) => String(entry || '').trim().toUpperCase())
    .filter((entry) => KEYWORD_PROVIDER_KEYS.includes(entry));

  return upperCased.length ? Array.from(new Set(upperCased)) : [fallback];
}

async function adaptDataForSeoResult(promise, providerKey) {
  const result = await promise;

  return {
    provider: providerKey,
    ok: true,
    keywords: Array.isArray(result?.keywords) ? result.keywords : [],
    cached: Boolean(result?.cached),
    logId: result?.logId ?? null,
  };
}

// Provider fetcher tables. Each operation maps a provider key to a fetcher.
// DataForSEO uses the existing concrete clients; SE Ranking returns a graceful
// no-op result until its API access is configured.
const KEYWORD_PROVIDER_FETCHERS = {
  OVERVIEW: {
    DATAFORSEO: (ctx) =>
      adaptDataForSeoResult(fetchDataForSeoKeywordOverview(ctx), 'DATAFORSEO'),
    SE_RANKING: (_ctx) => fetchSeRankingKeywordOverview(_ctx),
  },
  SIMILAR: {
    DATAFORSEO: (ctx) =>
      adaptDataForSeoResult(fetchDataForSeoSimilarKeywords(ctx), 'DATAFORSEO'),
    SE_RANKING: (_ctx) => fetchSeRankingSimilarKeywords(_ctx),
  },
  SUGGESTIONS: {
    DATAFORSEO: (ctx) =>
      adaptDataForSeoResult(fetchDataForSeoKeywordSuggestions(ctx), 'DATAFORSEO'),
    SE_RANKING: (_ctx) => fetchSeRankingKeywordSuggestions(_ctx),
  },
};

// ---- SE Ranking client ---------------------------------------------------
// Docs: https://seranking.com/api/data/keyword-research/
// Base URL: https://api.seranking.com/v1
// Auth header: `Authorization: Token <API_KEY>`
//
// Three endpoints we use:
//   POST /keywords/export        — keyword overview (form-data: keywords[])
//   GET  /keywords/similar       — similar keywords (query: keyword=)
//   GET  /keywords/related       — related/suggestion keywords (query: keyword=)
// All three take a required `source` query param (country code: us, uk, ...).
// Paginated responses are `{ total, keywords: [...] }`; the export endpoint
// returns a top-level array. `mapSeRankingRows` handles both shapes.

const SE_RANKING_SOURCE_OVERRIDES = {
  GB: 'uk', // SE Ranking exposes the United Kingdom as `uk`, not `gb`
};

const SE_RANKING_INTENT_LABELS = {
  I: 'Informational',
  N: 'Navigational',
  C: 'Commercial',
  T: 'Transactional',
  L: 'Local',
};

let seRankingRequestQueue = Promise.resolve();
let seRankingNextRequestAt = 0;

function normalizeSeRankingBaseUrl(rawBaseUrl) {
  const fallback = 'https://api.seranking.com/v1';
  let url;

  try {
    url = new URL(rawBaseUrl || fallback);
  } catch (_error) {
    url = new URL(fallback);
  }

  // api4.seranking.com is the older Project API host. Keyword Research belongs
  // to the Data API and must use api.seranking.com/v1.
  if (url.hostname === 'api4.seranking.com') {
    return 'https://api.seranking.com/v1/';
  }

  if (url.hostname === 'api.seranking.com' && !url.pathname.startsWith('/v1')) {
    url.pathname = '/v1';
  }

  url.pathname = url.pathname.replace(/\/+$/, '') || '/v1';
  url.search = '';
  url.hash = '';

  return `${url.toString().replace(/\/+$/, '')}/`;
}

function buildSeRankingUrl(baseUrl, path) {
  return new URL(String(path || '').replace(/^\/+/, ''), normalizeSeRankingBaseUrl(baseUrl));
}

async function scheduleSeRankingRequest(requester, requestsPerSecond) {
  const normalizedRps = Number(requestsPerSecond);
  const intervalMs = 1000 / (Number.isFinite(normalizedRps) && normalizedRps > 0 ? normalizedRps : 1);

  const queuedRequest = seRankingRequestQueue.then(async () => {
    const waitMs = Math.max(0, seRankingNextRequestAt - Date.now());

    if (waitMs > 0) {
      await delay(waitMs);
    }

    seRankingNextRequestAt = Date.now() + intervalMs;

    return requester();
  });

  seRankingRequestQueue = queuedRequest.catch(() => {});

  return queuedRequest;
}

function getRetryAfterMs(response) {
  const retryAfter = response?.headers?.get?.('retry-after');

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(retryAfter);

  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return null;
}

async function requestSeRankingWithRetry(requester, maxAttempts = 3) {
  let result = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = await requester();

    if (result.response.status !== 429 || attempt === maxAttempts) {
      return result;
    }

    const retryAfterMs = getRetryAfterMs(result.response);
    const backoffMs = retryAfterMs ?? ((2 ** (attempt - 1)) * 1000 + Math.floor(Math.random() * 250));

    await delay(backoffMs);
  }

  return result;
}

function resolveSeRankingSource(payload) {
  const raw = String(payload?.countryIsoCode || '').trim().toUpperCase();

  if (!raw) {
    return 'us';
  }

  return SE_RANKING_SOURCE_OVERRIDES[raw] || raw.toLowerCase();
}

function mapSeRankingIntents(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const labels = value
    .map((code) => SE_RANKING_INTENT_LABELS[String(code || '').toUpperCase()] || null)
    .filter(Boolean);

  return labels.length ? labels.join(', ') : null;
}

function mapSeRankingRows(responsePayload, fallbackKeyword) {
  const rows = Array.isArray(responsePayload)
    ? responsePayload
    : Array.isArray(responsePayload?.keywords)
      ? responsePayload.keywords
      : Array.isArray(responsePayload?.data)
        ? responsePayload.data
        : [];

  return rows
    .map((entry, index) => {
      const keyword =
        entry?.keyword || entry?.term || entry?.query || fallbackKeyword || null;

      if (!keyword) {
        return null;
      }

      const searchVolume = Number(entry?.volume);
      const difficulty = Number(entry?.difficulty);
      const cpc = Number(entry?.cpc);
      const intent = mapSeRankingIntents(entry?.intents);
      const serpFeatures = Array.isArray(entry?.serp_features)
        ? entry.serp_features
        : [];

      return {
        id: `${String(keyword).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ser-${index + 1}`,
        keyword,
        searchVolume: Number.isFinite(searchVolume) ? searchVolume : null,
        kd: Number.isFinite(difficulty) ? difficulty : null,
        intent,
        serp: serpFeatures.length ? String(serpFeatures[0]) : null,
        cpc: Number.isFinite(cpc) ? cpc : null,
      };
    })
    .filter(Boolean);
}

function extractSeRankingErrorMessage(responsePayload, status) {
  if (!responsePayload) {
    return `SE Ranking request failed (status ${status}).`;
  }

  if (typeof responsePayload === 'string') {
    return responsePayload;
  }

  return (
    responsePayload.message ||
    (typeof responsePayload.error === 'string'
      ? responsePayload.error
      : responsePayload.error?.message || responsePayload.error?.description) ||
    responsePayload.detail ||
    (Array.isArray(responsePayload.errors)
      ? responsePayload.errors.map((entry) => entry?.message || JSON.stringify(entry)).join('; ')
      : null) ||
    `SE Ranking request failed (status ${status}).`
  );
}

async function runSeRankingResearch({ env, payload, operation }) {
  const apiKey = env.integrations.seRanking?.apiKey;

  if (!apiKey) {
    return {
      provider: 'SE_RANKING',
      ok: false,
      keywords: [],
      notConfigured: true,
    };
  }

  const keyword = optionalString(payload?.keyword);

  if (!keyword) {
    return {
      provider: 'SE_RANKING',
      ok: false,
      keywords: [],
      error: 'keyword is required',
    };
  }

  const source = resolveSeRankingSource(payload);
  const baseUrl =
    env.integrations.seRanking.baseUrl || 'https://api.seranking.com/v1';
  const requestsPerSecond = env.integrations.seRanking.requestsPerSecond || 1;
  const limit = Number(payload?.limit) > 0 ? Number(payload.limit) : 100;

  try {
    if (operation === 'OVERVIEW') {
      const url = buildSeRankingUrl(baseUrl, 'keywords/export');

      url.searchParams.set('source', source);

      const form = new URLSearchParams();

      form.append('keywords[]', keyword);

      const { response, payload: responsePayload } = await requestSeRankingWithRetry(() =>
        scheduleSeRankingRequest(
          () =>
            postJson(url.toString(), {
              method: 'POST',
              headers: {
                Authorization: `Token ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
              },
              body: form.toString(),
            }),
          requestsPerSecond,
        ),
      );

      if (!response.ok) {
        return {
          provider: 'SE_RANKING',
          ok: false,
          keywords: [],
          error: extractSeRankingErrorMessage(responsePayload, response.status),
          upstreamStatus: response.status,
        };
      }

      return {
        provider: 'SE_RANKING',
        ok: true,
        keywords: mapSeRankingRows(responsePayload, keyword),
      };
    }

    const segmentMap = { SIMILAR: 'similar', SUGGESTIONS: 'related' };
    const segment = segmentMap[operation];

    if (!segment) {
      return {
        provider: 'SE_RANKING',
        ok: false,
        keywords: [],
        error: `Unknown SE Ranking operation: ${operation}`,
      };
    }

    const url = buildSeRankingUrl(baseUrl, `keywords/${segment}`);

    url.searchParams.set('source', source);
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('limit', String(limit));

    const { response, payload: responsePayload } = await requestSeRankingWithRetry(() =>
      scheduleSeRankingRequest(
        () =>
          getJson(url.toString(), {
            method: 'GET',
            headers: {
              Authorization: `Token ${apiKey}`,
              Accept: 'application/json',
            },
          }),
        requestsPerSecond,
      ),
    );

    if (!response.ok) {
      return {
        provider: 'SE_RANKING',
        ok: false,
        keywords: [],
        error: extractSeRankingErrorMessage(responsePayload, response.status),
        upstreamStatus: response.status,
      };
    }

    return {
      provider: 'SE_RANKING',
      ok: true,
      keywords: mapSeRankingRows(responsePayload, keyword),
    };
  } catch (error) {
    return {
      provider: 'SE_RANKING',
      ok: false,
      keywords: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchSeRankingKeywordOverview(ctx) {
  return runSeRankingResearch({ ...ctx, operation: 'OVERVIEW' });
}

async function fetchSeRankingSimilarKeywords(ctx) {
  return runSeRankingResearch({ ...ctx, operation: 'SIMILAR' });
}

async function fetchSeRankingKeywordSuggestions(ctx) {
  return runSeRankingResearch({ ...ctx, operation: 'SUGGESTIONS' });
}

function avgIgnoringNulls(values) {
  const numeric = values
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map((value) => Number(value));

  if (!numeric.length) {
    return null;
  }

  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function pickFirst(values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      return value;
    }
  }

  return null;
}

function mergeKeywordRowsByProvider(perProviderResults) {
  const buckets = new Map();

  for (const result of perProviderResults) {
    if (!result?.keywords?.length) {
      continue;
    }

    for (const row of result.keywords) {
      const keyword = String(row?.keyword || '').trim();

      if (!keyword) {
        continue;
      }

      const key = keyword.toLowerCase();
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = {
          keyword,
          contributions: [],
          sources: {},
        };
        buckets.set(key, bucket);
      }

      bucket.contributions.push({ provider: result.provider, row });
      bucket.sources[result.provider] = {
        searchVolume: row.searchVolume ?? null,
        kd: row.kd ?? null,
        cpc: row.cpc ?? null,
        intent: row.intent ?? null,
        serp: row.serp ?? null,
      };
    }
  }

  return Array.from(buckets.values()).map((bucket, index) => {
    const volumes = bucket.contributions.map(({ row }) => row.searchVolume);
    const kds = bucket.contributions.map(({ row }) => row.kd);
    const cpcs = bucket.contributions.map(({ row }) => row.cpc);
    const searchVolumeAvg = avgIgnoringNulls(volumes);
    const kdAvg = avgIgnoringNulls(kds);
    const cpcAvg = avgIgnoringNulls(cpcs);

    return {
      id: `${bucket.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
      keyword: bucket.keyword,
      searchVolume: searchVolumeAvg === null ? null : Math.round(searchVolumeAvg),
      kd: kdAvg === null ? null : Math.round(kdAvg),
      cpc: cpcAvg === null ? null : Number(cpcAvg.toFixed(2)),
      intent: pickFirst(bucket.contributions.map(({ row }) => row.intent)),
      serp: pickFirst(bucket.contributions.map(({ row }) => row.serp)),
      sources: bucket.sources,
    };
  });
}

async function orchestrateKeywordProviders({ db, env, requestedBy, payload, operation }) {
  const fetchers = KEYWORD_PROVIDER_FETCHERS[operation];

  if (!fetchers) {
    throw new AppError(500, 'INTERNAL_ERROR', `Unknown keyword operation: ${operation}`);
  }

  const providers = normalizeProvidersInput(payload?.providers, env);
  const ctx = { db, env, requestedBy, payload };
  const settled = await Promise.allSettled(
    providers.map((providerKey) => fetchers[providerKey](ctx)),
  );

  const perProviderResults = settled.map((entry, index) => {
    const providerKey = providers[index];

    if (entry.status === 'fulfilled') {
      return entry.value;
    }

    return {
      provider: providerKey,
      ok: false,
      keywords: [],
      error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
    };
  });

  const successfulProviders = perProviderResults.filter((result) => result.ok);

  // If every provider failed, surface the first error so the caller knows
  // why the response is empty. (Otherwise an empty keyword list looks like
  // a "no results" instead of an upstream error.)
  if (!successfulProviders.length) {
    const firstError = perProviderResults.find((result) => result.error);

    if (firstError) {
      const isRateLimited =
        firstError.upstreamStatus === 429 ||
        /too many requests|rate limit/i.test(String(firstError.error || ''));

      throw new AppError(
        isRateLimited ? 429 : 502,
        isRateLimited ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_API_ERROR',
        firstError.error || 'Keyword research providers all failed.',
      );
    }
  }

  const keywords = mergeKeywordRowsByProvider(perProviderResults);

  return {
    keywords,
    providers: perProviderResults.map((result) => ({
      provider: result.provider,
      ok: Boolean(result.ok),
      notConfigured: Boolean(result.notConfigured),
      error: result.error ?? null,
      keywordCount: Array.isArray(result.keywords) ? result.keywords.length : 0,
    })),
  };
}

async function fetchKeywordOverviewMultiProvider(ctx) {
  return orchestrateKeywordProviders({ ...ctx, operation: 'OVERVIEW' });
}

async function fetchSimilarKeywordsMultiProvider(ctx) {
  return orchestrateKeywordProviders({ ...ctx, operation: 'SIMILAR' });
}

async function fetchKeywordSuggestionsMultiProvider(ctx) {
  return orchestrateKeywordProviders({ ...ctx, operation: 'SUGGESTIONS' });
}

module.exports = {
  syncDataForSeoGoogleAdsReferenceData,
  syncDataForSeoGoogleAdsLocations,
  listDataForSeoKeywordLanguages,
  listDataForSeoKeywordCountries,
  listDataForSeoKeywordRegions,
  fetchDataForSeoRankings,
  fetchDataForSeoMapsCompetitors,
  fetchDataForSeoGbpPosts,
  fetchDataForSeoKeywordOverview,
  fetchDataForSeoSimilarKeywords,
  fetchDataForSeoKeywordSuggestions,
  fetchKeywordOverviewMultiProvider,
  fetchSimilarKeywordsMultiProvider,
  fetchKeywordSuggestionsMultiProvider,
  fetchSerpApiGbpDetails,
  fetchSerpApiReviews,
  fetchManusGeneratedText
};
