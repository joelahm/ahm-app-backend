const { AppError } = require('../../lib/errors');
const anthropicContentService = require('../ai-content/anthropic.service');

const GENERATED_CONTENT_PLACEHOLDER = '__GENERATED_CONTENT__';

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

async function updateKeywordContentListKeyword({ actorUserId, db, payload }) {
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
  const contentPrompt = parseRequiredString(payload.contentPrompt, 'contentPrompt');
  const seoPromptTemplate = parseRequiredString(payload.seoPromptTemplate, 'seoPromptTemplate');
  const contentLength = parseRequiredString(payload.contentLength, 'contentLength');
  const contentType = parseRequiredString(payload.contentType, 'contentType');
  const title = parseRequiredString(payload.title, 'title');
  const maxContentTokens = parsePositiveInteger(payload.maxContentTokens, 'maxContentTokens', 4096);
  const maxSeoTokens = parsePositiveInteger(payload.maxSeoTokens, 'maxSeoTokens', 700);
  const layoutImageUrl = parseOptionalString(payload.layoutImageUrl);

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
    const generatedRaw = await anthropicContentService.generateMedicalWebsiteContent({
      env,
      maxOutputTokens: maxContentTokens,
      prompt: contentPrompt,
      layoutImageUrl,
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
    const seoRaw = await anthropicContentService.generateMedicalWebsiteContent({
      env,
      maxOutputTokens: maxSeoTokens,
      prompt: seoPrompt,
    });
    const seoText =
      typeof seoRaw === 'string' ? seoRaw : asString(seoRaw?.text);
    const seoFields = parseGeneratedSeoFields(seoText);

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
  } catch (error) {
    await updateKeywordContentListKeyword({
      actorUserId,
      db,
      payload: {
        keywordId,
        listId,
        status: 'Failed',
      },
    }).catch(() => {});

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

async function deleteKeywordContentListKeyword({ actorUserId, db, query }) {
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
