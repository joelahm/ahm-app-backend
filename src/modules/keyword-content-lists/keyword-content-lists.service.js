const { AppError } = require('../../lib/errors');
const anthropicContentService = require('../ai-content/anthropic.service');

const GENERATED_CONTENT_PLACEHOLDER = '__GENERATED_CONTENT__';
const CLIENT_KEYWORDS_LOCATION = '__client_keywords__';

// Canonical content-type labels accepted by AI Hub. Must mirror the frontend's
// `normalizePageTypeForPrompt` in client-website-content-screen.tsx and the
// WEB_CONTENT_TYPE_OPTIONS list in lib/web-content-types.ts. Whitespace-
// insensitive lookup; falls back to the raw label trimmed.
const WEBSITE_CONTENT_TYPE_LABELS = [
  'Homepage',
  'About Us Page',
  'Treatment Page',
  'Condition Page',
  'Service Page',
  'Department Page',
  'Location Page',
  'Doctor Profile Page',
  'Team Page',
  'Patient Information Page',
  'Blog Page',
  'Guide Page',
  'FAQ Page',
  'Case Study',
  'Press Release',
  'Contact Page',
  'Book Appointment Page',
  'Consultation Page',
  'Second Opinion Page',
  'Pricing Page',
  'Landing Page',
  'Feedback Page',
  'Privacy Policy',
  'Terms and Conditions',
  'Cookie Policy',
  'Medical Disclaimer',
  '404 Page',
];

function normalizeWebsiteContentTypeForPrompt(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  const exact = WEBSITE_CONTENT_TYPE_LABELS.find(
    (label) => label.toLowerCase() === normalized,
  );

  if (exact) return exact;

  // Aliases — mirror the frontend's normalizePageTypeForPrompt fall-throughs.
  if (normalized.includes('home')) return 'Homepage';
  if (normalized.includes('treatment') || normalized.includes('service')) {
    return 'Treatment Page';
  }
  if (normalized.includes('condition')) return 'Condition Page';
  if (normalized.includes('blog')) return 'Blog Page';
  if (normalized.includes('press')) return 'Press Release';

  return String(value || '').trim();
}

function normalizePromptTokenMap(values) {
  return Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => [
      String(key).toLowerCase(),
      value === undefined || value === null ? '' : String(value),
    ]),
  );
}

function resolveAiPromptTemplate(template, values) {
  const normalized = normalizePromptTokenMap(values);

  return String(template || '')
    .replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      (_, token) => normalized[String(token).toLowerCase()] ?? '',
    )
    .replace(
      /\[([A-Z0-9_]+)\]/g,
      (_, token) => normalized[String(token).toLowerCase()] ?? '',
    );
}

function stringifyJsonList(value) {
  if (!Array.isArray(value)) return '';

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const source = item;

        return String(
          source.name ?? source.label ?? source.title ?? source.value ?? '',
        ).trim();
      }

      return String(item ?? '').trim();
    })
    .filter(Boolean)
    .join(', ');
}

function stringifyPracticeHours(hours) {
  if (!Array.isArray(hours) || hours.length === 0) return '';

  return hours
    .map((item) => {
      const day = String(item?.day || '').trim();

      if (!day) return '';
      if (!item?.enabled) return `${day}: Closed`;

      const start = [item?.startTime, item?.startMeridiem]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
        .join(' ');
      const end = [item?.endTime, item?.endMeridiem]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
        .join(' ');

      return start && end ? `${day}: ${start} - ${end}` : `${day}: Open`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildWebsiteContentPromptValues({
  client,
  contentType,
  contentLength,
  contentTitle,
  intent,
  keyword,
}) {
  const safeClient = client || {};
  const businessName = asString(safeClient.businessName);
  const website = asString(safeClient.website);
  const cityState = asString(safeClient.cityState);
  const country = asString(safeClient.country);
  const profession = asString(safeClient.profession);
  const niche = asString(safeClient.niche);
  const practiceIntroduction = asString(safeClient.practiceIntroduction);
  const targetArea = asString(safeClient.visibleArea);
  const normalizedType = normalizeWebsiteContentTypeForPrompt(contentType);

  return {
    address: [
      safeClient.addressLine1,
      safeClient.addressLine2,
      cityState,
      country,
    ]
      .map((value) => asString(value))
      .filter(Boolean)
      .join(', '),
    address_line_1: asString(safeClient.addressLine1),
    address_line_2: asString(safeClient.addressLine2),
    audience: '',
    brand_name: businessName,
    business_name: businessName,
    business_phone: asString(safeClient.businessPhone),
    city_state: cityState,
    client_building_name: asString(safeClient.buildingName),
    client_business_email: asString(safeClient.practiceEmail),
    client_business_name: businessName,
    client_business_phone: asString(safeClient.businessPhone),
    client_city_state: cityState,
    client_conditions_treated: stringifyJsonList(safeClient.conditionsTreated),
    client_country: country,
    client_credentials: asString(safeClient.credentials),
    client_discord_channel: asString(safeClient.discordChannel),
    client_facebook: asString(safeClient.facebook),
    client_gbp_link: asString(safeClient.gbpLink),
    client_gmc_registration_number: asString(safeClient.gmcRegistrationNumber),
    client_instagram: asString(safeClient.instagram),
    client_linkedin: asString(safeClient.linkedin),
    client_major_accomplishments: asString(safeClient.majorAccomplishments),
    client_name: asString(safeClient.clientName),
    client_nearby_areas_served: asString(safeClient.nearbyAreasServed),
    client_niche: niche,
    client_personal_email: asString(safeClient.personalEmail),
    client_personal_phone: asString(safeClient.personalPhone),
    client_post_code: asString(safeClient.postCode),
    client_practice_hours: stringifyPracticeHours(safeClient.practiceHours),
    client_practice_introduction: practiceIntroduction,
    client_practice_structure: asString(safeClient.practiceStructure),
    client_profession: profession,
    client_region: asString(safeClient.region),
    client_special_interests: stringifyJsonList(safeClient.specialInterests),
    client_street_address: asString(safeClient.streetAddress),
    client_sub_specialty: stringifyJsonList(safeClient.subSpecialties),
    client_sub_specialties: stringifyJsonList(safeClient.subSpecialties),
    client_target_area: targetArea,
    client_title: profession,
    client_top_medical_specialties: stringifyJsonList(
      safeClient.topMedicalSpecialties,
    ),
    client_top_treatments: stringifyJsonList(safeClient.topTreatments),
    client_treatment_and_services: stringifyJsonList(
      safeClient.treatmentAndServices,
    ),
    client_type_of_practice: asString(safeClient.typeOfPractice),
    client_unique_to_competitors: asString(safeClient.uniqueToCompetitors),
    client_unit_number: asString(safeClient.unitNumber),
    client_visible_area: targetArea,
    client_website: website,
    content_type: normalizedType,
    country,
    intent: asString(intent),
    keyword: asString(keyword),
    location: cityState || country,
    max_character: asString(contentLength),
    max_characters: asString(contentLength),
    niche,
    page_type: normalizedType,
    personal_email: asString(safeClient.personalEmail),
    post_code: asString(safeClient.postCode),
    practice_email: asString(safeClient.practiceEmail),
    practice_introduction: practiceIntroduction,
    profession,
    topic: asString(keyword),
    url: website,
    webcontent_audience: '',
    webcontent_content_length: asString(contentLength),
    webcontent_content_type: normalizedType,
    webcontent_intent: asString(intent),
    webcontent_keyword: asString(keyword),
    webcontent_search_volume: '',
    webcontent_title: asString(contentTitle),
    webcontent_topic: asString(keyword),
    website,
  };
}

function buildLengthInstruction(contentLength) {
  const value = asString(contentLength).trim();

  if (!value) {
    return 'Use a reasonable length appropriate for the page type.';
  }

  return `Aim for approximately ${value}. Do not pad with filler.`;
}

const WEBSITE_CONTENT_FORMATTING_FOOTER = [
  '',
  'FORMATTING REQUIREMENT:',
  'Return clean semantic HTML suitable for a WYSIWYG editor. Use exactly one <h1> near the top for the main page title, use <h2> for primary sections, use <h3> only when needed for subsections, use <p> for body copy, and use <ul>/<ol>/<li> where appropriate. Do not return markdown, code fences, inline styles, or wrapper tags like <html> or <body>.',
  '',
  'COMPLETION REQUIREMENT:',
  'Finish with a complete sentence and a complete final section. Do not end with an unfinished paragraph, incomplete word, partial HTML tag, markdown fragment, dangling "<", or dangling character. Close every opened tag before the answer ends.',
].join('\n');

async function resolveWebsiteContentPromptFromAiHub({
  db,
  clientId,
  contentType,
  contentLength,
  contentTitle,
  intent,
  keyword,
  clusterType,
  parentPillarTopic,
}) {
  const normalizedContentType = normalizeWebsiteContentTypeForPrompt(contentType);

  if (!normalizedContentType) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Content type is required.');
  }

  const promptRecord = await db.aiPrompt.findFirst({
    where: {
      status: 'Active',
      typeOfPost: normalizedContentType,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!promptRecord || !promptRecord.prompt) {
    throw new AppError(
      400,
      'AI_PROMPT_NOT_FOUND',
      `No active AI Hub prompt found for "${normalizedContentType}". Create or activate one in Settings → AI Hub.`,
    );
  }

  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const values = buildWebsiteContentPromptValues({
    client,
    contentType: normalizedContentType,
    contentLength,
    contentTitle,
    intent,
    keyword,
  });

  const resolvedBody = resolveAiPromptTemplate(promptRecord.prompt, values).trim();

  if (!resolvedBody) {
    throw new AppError(
      400,
      'AI_PROMPT_RESOLUTION_FAILED',
      `Resolved AI Hub prompt is empty for "${normalizedContentType}".`,
    );
  }

  const normalizedCluster = String(clusterType || '').trim().toLowerCase();
  const clusterInstruction =
    normalizedCluster === 'pillar'
      ? 'This is a pillar content page. Write broad, comprehensive, authority-style content for the main topic.'
      : normalizedCluster === 'cluster'
        ? `This is a cluster content page. Write focused subtopic content that semantically supports the pillar topic "${asString(parentPillarTopic)}". Include internal linking context to the pillar page when relevant.`
        : '';

  const clusterBlock = clusterInstruction
    ? `${clusterInstruction}\nCluster Type: ${normalizedCluster || 'standalone'}\nParent Pillar Topic: ${asString(parentPillarTopic) || 'N/A'}`
    : '';

  const lengthBlock = `FINAL LENGTH REQUIREMENT:\n${buildLengthInstruction(contentLength)}`;

  return [resolvedBody, clusterBlock, lengthBlock, WEBSITE_CONTENT_FORMATTING_FOOTER]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

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

function parseRequiredString(value, fieldName) {
  const normalized = asString(value).trim();

  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }

  return normalized;
}

function parseOptionalString(value) {
  return asString(value).trim() || null;
}

function parsePositiveInteger(value, fieldName, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }

  return parsed;
}

function cleanGeneratedWebsiteContent(value) {
  return asString(value)
    .trim()
    .replace(/\s*<[^>\n\r]*$/g, '')
    .replace(/\s*&(?:[a-zA-Z0-9#]*)?$/g, '')
    .replace(/\n?\s*#{1,6}\s*$/g, '')
    .trim();
}

function stripHtmlToPlainText(value) {
  if (!value) {
    return '';
  }

  const cleanedValue = asString(value)
    .replace(/<[^>\n]{0,80}$/g, '')
    .replace(/<\/[^>\n]{0,80}$/g, '')
    .replace(/&lt;[^&\n]{0,80}$/g, '')
    .replace(/(?:^|\n)\s*[<][a-z0-9/\s-]*$/gi, '')
    .trim();

  const withLineBreaks = cleanedValue
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h1|h2|h3|h4|h5|h6)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\/\s*li\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  const decoded = withLineBreaks
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  return decoded
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n?\s*<\s*[a-z0-9/]*\s*$/i, '')
    .trim();
}

function parseGeneratedSeoFields(value) {
  const trimmed = asString(value).trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonSource = fencedMatch?.[1]?.trim() || trimmed;
  const objectMatch = jsonSource.match(/\{[\s\S]*\}/);
  const normalizedSource = objectMatch?.[0] || jsonSource;
  let parsed;

  try {
    parsed = JSON.parse(normalizedSource);
  } catch {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'Failed to parse generated SEO metadata.');
  }

  const metaTitle = asString(parsed.metaTitle).trim();
  const metaDescription = asString(parsed.metaDescription).trim();
  const altTitle = asString(parsed.altTitle).trim();
  const altDescription = asString(parsed.altDescription).trim();

  if (!metaTitle || !metaDescription || !altTitle || !altDescription) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'Generated SEO metadata was incomplete.');
  }

  return {
    altDescription,
    altTitle,
    metaDescription,
    metaTitle,
  };
}

function normalizeKeywordItem(value) {
  const source = typeof value === 'object' && value !== null ? value : {};

  const altDescription = asString(source.altDescription).trim();
  const altTitle = asString(source.altTitle).trim();
  const title = asString(source.title).trim();
  const keyword = asString(source.keyword).trim();
  const contentType = asString(source.contentType).trim();
  const parentKeywordId = asString(source.parentKeywordId).trim();
  const isPillarArticle = Boolean(source.isPillarArticle);
  const contentLength = asString(source.contentLength).trim();
  const metaDescription = asString(source.metaDescription).trim();
  const metaTitle = asString(source.metaTitle).trim();
  const status = asString(source.status).trim();
  const generatedContent = asString(source.generatedContent).trim();
  const urlSlug = asString(source.urlSlug).trim();

  if (!keyword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Keyword is required.');
  }

  if (!contentType) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Content type is required.');
  }

  return {
    altDescription: altDescription || null,
    altTitle: altTitle || null,
    contentLength: contentLength || 'Short',
    contentType,
    cpc: Number.isFinite(source.cpc) ? source.cpc : null,
    generatedContent: generatedContent || null,
    id: asString(source.id).trim() || null,
    intent: asString(source.intent).trim() || null,
    isPillarArticle,
    kd: Number.isFinite(source.kd) ? source.kd : null,
    keyword,
    metaDescription: metaDescription || null,
    metaTitle: metaTitle || null,
    parentKeywordId: parentKeywordId || null,
    searchVolume: Number.isFinite(source.searchVolume) ? source.searchVolume : null,
    status: status || 'Not started',
    title,
    urlSlug: urlSlug || null,
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

const DEFAULT_CONTENT_BREAKDOWN_ITEMS = [
  { key: 'treatment', label: 'Treatment pages', allocated: 10, used: 0 },
  { key: 'condition', label: 'Condition pages', allocated: 5, used: 0 },
  { key: 'blogs', label: 'Blogs', allocated: 40, used: 0 },
  { key: 'press', label: 'Press Release', allocated: 10, used: 0 },
  { key: 'homepage', label: 'Homepage', allocated: 1, used: 0 },
];

function normalizeBreakdownItem(value) {
  const source = typeof value === 'object' && value !== null ? value : {};
  const key = asString(source.key).trim();
  const label = asString(source.label).trim();
  const allocated = Number(source.allocated);
  const used = Number(source.used);

  if (!key) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Breakdown key is required.');
  }

  if (!label) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Breakdown label is required.');
  }

  if (!Number.isFinite(allocated) || allocated < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Breakdown allocated must be a non-negative number.');
  }

  if (!Number.isFinite(used) || used < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Breakdown used must be a non-negative number.');
  }

  return {
    key,
    label,
    allocated: Math.trunc(allocated),
    used: Math.trunc(used),
  };
}

function normalizeBreakdownPayload(payload) {
  const source = typeof payload === 'object' && payload !== null ? payload : {};
  const items = Array.isArray(source.items) ? source.items : [];

  if (!items.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Breakdown items are required.');
  }

  return items.map(normalizeBreakdownItem);
}

function stringifyActivityValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function readUserName(user) {
  const parts = [user?.firstName, user?.lastName]
    .map((value) => asString(value).trim())
    .filter(Boolean);

  return parts.join(' ') || asString(user?.email).trim() || null;
}

function getContentBreakdownSettingKey(clientId) {
  return `website_content_breakdown:${String(clientId)}`;
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
  const where = {
    ...(clientId ? { clientId } : {}),
    location: { not: CLIENT_KEYWORDS_LOCATION },
  };
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

// In-process per-list mutex. Every write to a `keyword_content_lists` row's
// `keywords_json` is a read-modify-write — without this, two concurrent jobs
// (e.g. pillar + cluster generated in parallel) snapshot the same JSON, then
// the later write overwrites the earlier one's status. Symptom: one job
// "completes" but its peer reverts to "Generating" forever.
const listKeywordWriteQueues = new Map();

function runWithListLock(listId, task) {
  const key = String(listId);
  const previous = listKeywordWriteQueues.get(key) || Promise.resolve();
  // Chain regardless of previous outcome so one failure doesn't block the
  // queue. Track the head as a non-throwing variant.
  const next = previous.then(task, task);
  const safeNext = next.catch(() => undefined);

  listKeywordWriteQueues.set(key, safeNext);
  // Keep the map bounded: once we're at the tail, drop the entry.
  safeNext.then(() => {
    if (listKeywordWriteQueues.get(key) === safeNext) {
      listKeywordWriteQueues.delete(key);
    }
  });

  return next;
}

async function updateKeywordContentListKeyword(options) {
  return runWithListLock(options?.payload?.listId, () =>
    updateKeywordContentListKeywordImpl(options),
  );
}

async function updateKeywordContentListKeywordImpl({ actorUserId, db, payload }) {
  const listId = parseUnsignedBigInt(payload.listId, 'listId');
  const keywordId = parseRequiredString(payload.keywordId, 'keywordId');
  const hasParentKeywordId = Object.prototype.hasOwnProperty.call(
    payload,
    'parentKeywordId',
  );
  const hasIsPillarArticle = Object.prototype.hasOwnProperty.call(
    payload,
    'isPillarArticle',
  );
  const hasContentType = Object.prototype.hasOwnProperty.call(payload, 'contentType');
  const hasContentLength = Object.prototype.hasOwnProperty.call(payload, 'contentLength');
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, 'status');
  const hasTitle = Object.prototype.hasOwnProperty.call(payload, 'title');
  const hasMetaTitle = Object.prototype.hasOwnProperty.call(payload, 'metaTitle');
  const hasMetaDescription = Object.prototype.hasOwnProperty.call(payload, 'metaDescription');
  const hasUrlSlug = Object.prototype.hasOwnProperty.call(payload, 'urlSlug');
  const hasAltTitle = Object.prototype.hasOwnProperty.call(payload, 'altTitle');
  const hasAltDescription = Object.prototype.hasOwnProperty.call(payload, 'altDescription');
  const hasFeaturedImage = Object.prototype.hasOwnProperty.call(payload, 'featuredImage');
  const hasGeneratedContent = Object.prototype.hasOwnProperty.call(
    payload,
    'generatedContent',
  );

  const parentKeywordIdRaw = asString(payload.parentKeywordId).trim();
  const parentKeywordId = parentKeywordIdRaw || null;
  const isPillarArticle =
    payload.isPillarArticle === undefined
      ? undefined
      : Boolean(payload.isPillarArticle);
  const contentType = asString(payload.contentType).trim();
  const contentLength = asString(payload.contentLength).trim();
  const status = asString(payload.status).trim();
  const title = asString(payload.title).trim();
  const metaTitle = asString(payload.metaTitle).trim() || null;
  const metaDescription = asString(payload.metaDescription).trim() || null;
  const urlSlug = asString(payload.urlSlug).trim() || null;
  const altTitle = asString(payload.altTitle).trim() || null;
  const altDescription = asString(payload.altDescription).trim() || null;
  const featuredImage = hasFeaturedImage ? payload.featuredImage ?? null : undefined;
  const generatedContentRaw = asString(payload.generatedContent);
  const generatedContent = generatedContentRaw.trim() || null;

  if (hasParentKeywordId && parentKeywordId && parentKeywordId === keywordId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A keyword cannot be parent of itself.');
  }

  const record = await db.keywordContentList.findUnique({
    where: { id: listId },
    select: {
      clientId: true,
      id: true,
      keywordsJson: true,
    },
  });

  if (!record) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword content list not found.');
  }

  const existingKeywords = Array.isArray(record.keywordsJson) ? record.keywordsJson : [];
  const keywordIndex = existingKeywords.findIndex(
    (item) => asString(item?.id).trim() === keywordId,
  );

  if (keywordIndex < 0) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword not found in list.');
  }

  const nextKeywords = existingKeywords.map((item, index) => {
    if (index !== keywordIndex) {
      if (hasIsPillarArticle && isPillarArticle) {
        return {
          ...item,
          isPillarArticle: false,
        };
      }

      return item;
    }

    return {
      ...item,
      contentLength:
        hasContentLength && contentLength ? contentLength : asString(item?.contentLength).trim() || 'Short',
      contentType: hasContentType && contentType ? contentType : asString(item?.contentType).trim(),
      altDescription: hasAltDescription ? altDescription : item?.altDescription ?? null,
      altTitle: hasAltTitle ? altTitle : item?.altTitle ?? null,
      featuredImage: hasFeaturedImage ? featuredImage : item?.featuredImage ?? null,
      generatedContent: hasGeneratedContent ? generatedContent : item?.generatedContent ?? null,
      isPillarArticle: hasIsPillarArticle
        ? Boolean(isPillarArticle)
        : Boolean(item?.isPillarArticle),
      parentKeywordId: hasParentKeywordId
        ? parentKeywordId
        : asString(item?.parentKeywordId).trim() || null,
      metaDescription: hasMetaDescription ? metaDescription : item?.metaDescription ?? null,
      metaTitle: hasMetaTitle ? metaTitle : item?.metaTitle ?? null,
      status: hasStatus && status ? status : asString(item?.status).trim() || 'Not started',
      title: hasTitle ? title : asString(item?.title).trim(),
      urlSlug: hasUrlSlug ? urlSlug : item?.urlSlug ?? null,
    };
  });
  const previousKeyword = existingKeywords[keywordIndex] || {};
  const updatedKeyword = nextKeywords[keywordIndex] || {};

  await db.keywordContentList.update({
    where: { id: listId },
    data: {
      keywordsJson: nextKeywords,
    },
  });

  const trackedFields = [
    ['title', 'Article Title', hasTitle],
    ['urlSlug', 'URL Slug', hasUrlSlug],
    ['metaTitle', 'Meta Title', hasMetaTitle],
    ['metaDescription', 'Meta Description', hasMetaDescription],
    ['generatedContent', 'Content', hasGeneratedContent],
    ['featuredImage', 'Featured Image', hasFeaturedImage],
    ['altTitle', 'Alt Title', hasAltTitle],
    ['altDescription', 'Alt Description', hasAltDescription],
  ];
  const changedFields = trackedFields
    .filter(([, , wasProvided]) => wasProvided)
    .map(([field, label]) => ({
      field,
      label,
      newValue: stringifyActivityValue(updatedKeyword?.[field]),
      oldValue: stringifyActivityValue(previousKeyword?.[field]),
    }))
    .filter((field) => field.oldValue !== field.newValue);

  if (changedFields.length > 0) {
    const actor = actorUserId
      ? await db.user.findUnique({
          where: { id: BigInt(actorUserId) },
          select: { email: true, firstName: true, lastName: true },
        })
      : null;

    await db.websiteContentVersion.create({
      data: {
        clientId: record.clientId,
        createdByEmail: actor?.email || null,
        createdByName: readUserName(actor),
        createdByType: 'USER',
        createdByUserId: actorUserId ? BigInt(actorUserId) : null,
        keywordContentListId: listId,
        keywordId,
        snapshotJson: {
          altDescription: updatedKeyword.altDescription ?? null,
          altTitle: updatedKeyword.altTitle ?? null,
          contentType: updatedKeyword.contentType ?? null,
          generatedContent: updatedKeyword.generatedContent ?? null,
          featuredImage: updatedKeyword.featuredImage ?? null,
          keyword: updatedKeyword.keyword ?? null,
          metaDescription: updatedKeyword.metaDescription ?? null,
          metaTitle: updatedKeyword.metaTitle ?? null,
          title: updatedKeyword.title ?? null,
          urlSlug: updatedKeyword.urlSlug ?? null,
        },
        source: 'DASHBOARD_EDIT',
      },
    });

    for (const field of changedFields) {
      // eslint-disable-next-line no-await-in-loop
      await db.websiteContentEditActivity.create({
        data: {
          action: 'FIELD_UPDATED',
          actorEmail: actor?.email || null,
          actorName: readUserName(actor),
          actorType: 'USER',
          actorUserId: actorUserId ? BigInt(actorUserId) : null,
          clientId: record.clientId,
          fieldName: field.label,
          keywordContentListId: listId,
          keywordId,
          newValue: field.newValue,
          oldValue: field.oldValue,
        },
      });
    }
  }

  if (actorUserId) {
    await db.auditLog.create({
      data: {
        action: 'website_content.keyword.update',
        actorUserId: BigInt(actorUserId),
        metadata: {
          contentLength: hasContentLength ? (contentLength || null) : undefined,
          contentType: hasContentType ? (contentType || null) : undefined,
          hasAltDescription: hasAltDescription ? Boolean(altDescription) : undefined,
          hasAltTitle: hasAltTitle ? Boolean(altTitle) : undefined,
          hasGeneratedContent: hasGeneratedContent ? Boolean(generatedContent) : undefined,
          hasFeaturedImage: hasFeaturedImage ? Boolean(featuredImage) : undefined,
          isPillarArticle:
            hasIsPillarArticle ? isPillarArticle : undefined,
          keywordId,
          listId: String(listId),
          hasMetaDescription: hasMetaDescription ? Boolean(metaDescription) : undefined,
          hasMetaTitle: hasMetaTitle ? Boolean(metaTitle) : undefined,
          hasUrlSlug: hasUrlSlug ? Boolean(urlSlug) : undefined,
          parentKeywordId: hasParentKeywordId ? parentKeywordId : undefined,
          status: hasStatus ? (status || null) : undefined,
        },
        resourceId: String(record.clientId),
        resourceType: 'client',
      },
    });
  }

  return {
    keywordId,
    listId: String(listId),
    parentKeywordId: hasParentKeywordId ? parentKeywordId : undefined,
    success: true,
    updatedKeywordCount: nextKeywords.length,
  };
}

async function runWebsiteContentGenerationJob({
  actorUserId,
  db,
  env,
  payload,
}) {
  const listId = String(parseUnsignedBigInt(payload.listId, 'listId'));
  const keywordId = parseRequiredString(payload.keywordId, 'keywordId');
  const clientId = String(parseUnsignedBigInt(payload.clientId, 'clientId'));
  const seoPromptTemplate = parseRequiredString(payload.seoPromptTemplate, 'seoPromptTemplate');
  const contentLength = parseRequiredString(payload.contentLength, 'contentLength');
  const contentType = parseRequiredString(payload.contentType, 'contentType');
  const title = parseRequiredString(payload.title, 'title');
  const maxContentTokens = parsePositiveInteger(payload.maxContentTokens, 'maxContentTokens', 4096);
  const maxSeoTokens = parsePositiveInteger(payload.maxSeoTokens, 'maxSeoTokens', 700);
  const layoutImageUrl = parseOptionalString(payload.layoutImageUrl);
  // Context the FE supplies for prompt resolution. Keyword/intent are required
  // for the AI Hub template tokens; cluster/parent are optional and only used
  // for the cluster instruction block.
  const promptKeyword =
    parseOptionalString(payload.keyword) || parseOptionalString(payload.contentKeyword) || '';
  const promptIntent = parseOptionalString(payload.intent) || '';
  const promptClusterType = parseOptionalString(payload.clusterType) || '';
  const promptParentPillarTopic =
    parseOptionalString(payload.parentPillarTopic) || '';
  const logTag = `[WebsiteContentJob list=${listId} keyword=${keywordId}]`;
  const jobStartedAt = Date.now();

  // eslint-disable-next-line no-console
  console.log(`${logTag} start`, { hasLayoutImage: Boolean(layoutImageUrl) });

  await updateKeywordContentListKeyword({
    actorUserId,
    db,
    payload: {
      keywordId,
      listId,
      status: 'Generating',
    },
  });

  try {
    // Resolve the AI Hub prompt SERVER-SIDE so the prompt body is authoritative
    // and cannot be tampered with client-side. The FE's `contentPrompt` (if
    // any) is intentionally ignored — Settings → AI Hub is the source of truth.
    const resolvedPromptStartedAt = Date.now();
    const resolvedPrompt = await resolveWebsiteContentPromptFromAiHub({
      db,
      clientId,
      contentType,
      contentLength,
      contentTitle: title,
      intent: promptIntent,
      keyword: promptKeyword || title,
      clusterType: promptClusterType,
      parentPillarTopic: promptParentPillarTopic,
    });
    // eslint-disable-next-line no-console
    console.log(`${logTag} prompt resolved from AI Hub`, {
      ms: Date.now() - resolvedPromptStartedAt,
      contentType,
      promptLength: resolvedPrompt.length,
    });

    const contentStartedAt = Date.now();
    const generatedRaw = await anthropicContentService.generateMedicalWebsiteContent({
      env,
      maxOutputTokens: maxContentTokens,
      prompt: resolvedPrompt,
      layoutImageUrl,
    });
    // eslint-disable-next-line no-console
    console.log(`${logTag} content call done`, {
      ms: Date.now() - contentStartedAt,
    });
    const generatedText =
      typeof generatedRaw === 'string'
        ? generatedRaw
        : asString(generatedRaw?.text);
    const generatedContent = cleanGeneratedWebsiteContent(generatedText);

    if (!generatedContent) {
      throw new AppError(502, 'UPSTREAM_API_ERROR', 'No content was generated. Please try again.');
    }

    const plainContent = stripHtmlToPlainText(generatedContent);
    const seoPrompt = seoPromptTemplate.includes(GENERATED_CONTENT_PLACEHOLDER)
      ? seoPromptTemplate.replace(GENERATED_CONTENT_PLACEHOLDER, plainContent)
      : `${seoPromptTemplate}\n\nContent:\n${plainContent}`;
    const seoStartedAt = Date.now();
    const seoRaw = await anthropicContentService.generateMedicalWebsiteContent({
      env,
      maxOutputTokens: maxSeoTokens,
      prompt: seoPrompt,
    });
    // eslint-disable-next-line no-console
    console.log(`${logTag} SEO call done`, {
      ms: Date.now() - seoStartedAt,
    });
    const seoText =
      typeof seoRaw === 'string' ? seoRaw : asString(seoRaw?.text);
    const seoFields = parseGeneratedSeoFields(seoText);

    const persistStartedAt = Date.now();
    await updateKeywordContentListKeyword({
      actorUserId,
      db,
      payload: {
        altDescription: seoFields.altDescription,
        altTitle: seoFields.altTitle,
        clientId,
        contentLength,
        contentType,
        generatedContent,
        keywordId,
        listId,
        metaDescription: seoFields.metaDescription,
        metaTitle: seoFields.metaTitle,
        status: 'Completed',
        title,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`${logTag} completed`, {
      persistMs: Date.now() - persistStartedAt,
      totalMs: Date.now() - jobStartedAt,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`${logTag} failing`, {
      message: error instanceof Error ? error.message : String(error),
      totalMs: Date.now() - jobStartedAt,
    });
    await updateKeywordContentListKeyword({
      actorUserId,
      db,
      payload: {
        keywordId,
        listId,
        status: 'Failed',
      },
    }).catch((persistError) => {
      // eslint-disable-next-line no-console
      console.error(`${logTag} failed to persist Failed status`, {
        message:
          persistError instanceof Error
            ? persistError.message
            : String(persistError),
      });
    });

    throw error;
  }
}

async function startWebsiteContentGeneration({ actorUserId, db, env, payload }) {
  const listId = String(parseUnsignedBigInt(payload.listId, 'listId'));
  const keywordId = parseRequiredString(payload.keywordId, 'keywordId');

  await updateKeywordContentListKeyword({
    actorUserId,
    db,
    payload: {
      keywordId,
      listId,
      status: 'Generating',
    },
  });

  setImmediate(() => {
    runWebsiteContentGenerationJob({
      actorUserId,
      db,
      env,
      payload,
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Website content generation failed:', error);
    });
  });

  return {
    keywordId,
    listId,
    queued: true,
    status: 'Generating',
  };
}

async function deleteKeywordContentListKeyword(options) {
  return runWithListLock(options?.query?.listId, () =>
    deleteKeywordContentListKeywordImpl(options),
  );
}

async function deleteKeywordContentListKeywordImpl({ actorUserId, db, query }) {
  const listId = parseUnsignedBigInt(query.listId, 'listId');
  const keywordId = parseRequiredString(query.keywordId, 'keywordId');

  const record = await db.keywordContentList.findUnique({
    where: { id: listId },
    select: {
      clientId: true,
      id: true,
      keywordsJson: true,
    },
  });

  if (!record) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword content list not found.');
  }

  const existingKeywords = Array.isArray(record.keywordsJson) ? record.keywordsJson : [];
  const nextKeywords = existingKeywords.filter((item) => {
    const id = asString(item?.id).trim();

    return id !== keywordId;
  });

  if (nextKeywords.length === existingKeywords.length) {
    throw new AppError(404, 'NOT_FOUND', 'Keyword not found in list.');
  }

  await db.keywordContentList.update({
    where: { id: listId },
    data: {
      keywordsJson: nextKeywords,
    },
  });

  if (actorUserId) {
    await db.auditLog.create({
      data: {
        action: 'website_content.keyword.delete',
        actorUserId: BigInt(actorUserId),
        metadata: {
          keywordId,
          listId: String(listId),
          remainingKeywordCount: nextKeywords.length,
        },
        resourceId: String(record.clientId),
        resourceType: 'client',
      },
    });
  }

  return {
    deletedKeywordId: keywordId,
    listId: String(listId),
    remainingKeywordCount: nextKeywords.length,
    success: true,
  };
}

async function getClientContentBreakdown({ db, query }) {
  const clientId = parseUnsignedBigInt(query.clientId, 'clientId');
  const setting = await db.appSetting.findUnique({
    where: {
      key: getContentBreakdownSettingKey(clientId),
    },
    select: {
      valueJson: true,
    },
  });

  const items = Array.isArray(setting?.valueJson)
    ? setting.valueJson.map(normalizeBreakdownItem)
    : DEFAULT_CONTENT_BREAKDOWN_ITEMS;

  return {
    clientId: String(clientId),
    items,
  };
}

async function saveClientContentBreakdown({ actorUserId, db, payload }) {
  const clientId = parseUnsignedBigInt(payload.clientId, 'clientId');
  const items = normalizeBreakdownPayload(payload);

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  await db.appSetting.upsert({
    where: {
      key: getContentBreakdownSettingKey(clientId),
    },
    create: {
      key: getContentBreakdownSettingKey(clientId),
      valueJson: items,
    },
    update: {
      valueJson: items,
    },
  });

  if (actorUserId) {
    await db.auditLog.create({
      data: {
        action: 'website_content.breakdown.save',
        actorUserId: BigInt(actorUserId),
        metadata: {
          clientId: String(clientId),
          itemCount: items.length,
        },
        resourceId: String(clientId),
        resourceType: 'client',
      },
    });
  }

  return {
    clientId: String(clientId),
    items,
  };
}

module.exports = {
  listKeywordContentLists,
  createKeywordContentList,
  updateKeywordContentListKeyword,
  startWebsiteContentGeneration,
  deleteKeywordContentListKeyword,
  getClientContentBreakdown,
  saveClientContentBreakdown,
};
