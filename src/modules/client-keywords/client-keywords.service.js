const { AppError } = require("../../lib/errors");
const integrationsService = require("../integrations/integrations.service");

const CLIENT_KEYWORDS_LOCATION = "__client_keywords__";
const CLIENT_KEYWORD_STATUSES = new Set(["APPROVE", "REJECTED", "ARCHIVED"]);
const CLIENT_KEYWORD_USE_IN_OPTIONS = new Map([
  ["LOCAL_RANKING", "Local Ranking"],
  ["WEB_CONTENT", "Web content"],
]);
const CLIENT_KEYWORD_TITLE_STATUSES = new Set([
  "IDLE",
  "GENERATING",
  "COMPLETED",
  "FAILED",
]);
const CLIENT_KEYWORD_PROVIDERS = new Set(["DATAFORSEO", "SE_RANKING"]);
const TITLE_GENERATION_CONCURRENCY = 3;
const META_TITLE_PROMPT_TYPE = "Meta Title";

function parseRequiredString(value, fieldName, maxLength = 255) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new AppError(400, "VALIDATION_ERROR", `${fieldName} is required.`);
  }

  if (normalized.length > maxLength) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must be ${maxLength} characters or less.`,
    );
  }

  return normalized;
}

function parseOptionalString(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || "").trim();

  return normalized || null;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]+/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeClientKeywordStatus(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  const key = normalized.toUpperCase().replace(/\s+/g, "_");

  if (!normalized || !CLIENT_KEYWORD_STATUSES.has(key)) {
    return "";
  }

  return normalized
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeClientKeywordUseIn(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim());

  return Array.from(
    new Set(
      rawValues
        .map((item) =>
          String(item || "")
            .trim()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .toUpperCase()
            .replace(/\s+/g, "_"),
        )
        .map((key) => CLIENT_KEYWORD_USE_IN_OPTIONS.get(key))
        .filter(Boolean),
    ),
  );
}

function normalizeClientKeywordContentType(value) {
  return parseOptionalString(value) || "";
}

function normalizeClientKeywordTitleStatus(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();

  return CLIENT_KEYWORD_TITLE_STATUSES.has(key) ? key : "IDLE";
}

function normalizeClientKeywordProvider(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();

  return CLIENT_KEYWORD_PROVIDERS.has(key) ? key : null;
}

function normalizePromptTokenMap(values) {
  return Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => [
      String(key).toLowerCase(),
      value === undefined || value === null ? "" : String(value),
    ]),
  );
}

function resolveAiPromptTemplate(template, values) {
  const normalized = normalizePromptTokenMap(values);

  return String(template || "")
    .replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      (_, token) => normalized[String(token).toLowerCase()] ?? "",
    )
    .replace(
      /\[([A-Z0-9_]+)\]/g,
      (_, token) => normalized[String(token).toLowerCase()] ?? "",
    );
}

function buildMetaTitlePromptValues({ client, keyword, contentType }) {
  const safeClient = client || {};
  const businessName = String(safeClient.businessName || "").trim();
  const cityState = String(safeClient.cityState || "").trim();
  const country = String(safeClient.country || "").trim();
  const profession = String(safeClient.profession || "").trim();
  const pageType = String(contentType || "").trim();
  const website = String(safeClient.website || "").trim();

  return {
    brand_name: businessName,
    business_name: businessName,
    business_phone: String(safeClient.businessPhone || "").trim(),
    client_business_name: businessName,
    client_business_email: String(safeClient.practiceEmail || "").trim(),
    client_business_phone: String(safeClient.businessPhone || "").trim(),
    client_city_state: cityState,
    client_country: country,
    client_name: String(safeClient.clientName || "").trim(),
    client_niche: String(safeClient.niche || "").trim(),
    client_personal_email: String(safeClient.personalEmail || "").trim(),
    client_personal_phone: String(safeClient.personalPhone || "").trim(),
    client_practice_introduction: String(
      safeClient.practiceIntroduction || "",
    ).trim(),
    client_profession: profession,
    client_target_area: String(safeClient.visibleArea || "").trim(),
    client_title: profession,
    client_website: website,
    content_type: pageType,
    country,
    keyword: String(keyword || "").trim(),
    location: cityState || country,
    niche: String(safeClient.niche || "").trim(),
    page_type: pageType,
    practice_email: String(safeClient.practiceEmail || "").trim(),
    practice_introduction: String(safeClient.practiceIntroduction || "").trim(),
    profession,
    topic: String(keyword || "").trim(),
    url: website,
    webcontent_content_type: pageType,
    webcontent_keyword: String(keyword || "").trim(),
    webcontent_title: String(keyword || "").trim(),
    website,
  };
}

function resolveMetaTitlePrompt({ promptRecord, client, keyword, contentType }) {
  const resolvedPrompt = resolveAiPromptTemplate(promptRecord?.prompt, {
    ...buildMetaTitlePromptValues({ client, keyword, contentType }),
    max_character: String(promptRecord?.maxCharacter || "").trim(),
    max_characters: String(promptRecord?.maxCharacter || "").trim(),
  }).trim();

  if (!resolvedPrompt) {
    throw new AppError(
      400,
      "AI_PROMPT_RESOLUTION_FAILED",
      `Resolved AI Hub prompt is empty for "${META_TITLE_PROMPT_TYPE}".`,
    );
  }

  return resolvedPrompt;
}

function normalizeClientKeywordItem(value) {
  const source = typeof value === "object" && value !== null ? value : {};
  const keyword = parseRequiredString(source.keyword, "keyword", 255);

  return {
    contentType: normalizeClientKeywordContentType(source.contentType),
    cpcUsd: parseOptionalNumber(source.cpcUsd ?? source.cpc ?? source.cpcUSD),
    generatedTitle: parseOptionalString(source.generatedTitle) || "",
    id:
      String(source.id || "").trim() ||
      `keyword-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    keyword,
    keywordDifficulty: parseOptionalNumber(
      source.keywordDifficulty ?? source.kd,
    ),
    note: parseOptionalString(source.note ?? source.notes) || "",
    provider: normalizeClientKeywordProvider(source.provider),
    searchIntent:
      parseOptionalString(source.searchIntent ?? source.intent) || "",
    searchVolume: parseOptionalNumber(
      source.searchVolume ?? source.sv ?? source.volume,
    ),
    serp: parseOptionalString(source.serp) || "",
    status: normalizeClientKeywordStatus(source.status),
    titleError: parseOptionalString(source.titleError) || "",
    titleStatus: normalizeClientKeywordTitleStatus(source.titleStatus),
    useIn: normalizeClientKeywordUseIn(source.useIn ?? source.use_in),
  };
}

function mapClientKeywordRecord(record) {
  return Array.isArray(record?.keywordsJson)
    ? record.keywordsJson
        .map((item) => {
          try {
            return normalizeClientKeywordItem(item);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
}

async function assertClientExists({ db, clientId }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true },
  });

  if (!clientExists) {
    throw new AppError(404, "NOT_FOUND", "Client not found.");
  }
}

async function findClientKeywordsRecord({ db, clientId }) {
  return db.keywordContentList.findFirst({
    where: {
      clientId: BigInt(clientId),
      location: CLIENT_KEYWORDS_LOCATION,
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function listClientKeywords({ db, clientId }) {
  await assertClientExists({ db, clientId });

  const record = await findClientKeywordsRecord({ db, clientId });
  const keywords = mapClientKeywordRecord(record);

  return {
    keywords,
    total: keywords.length,
  };
}

async function importClientKeywords({ db, actorUserId, clientId, payload }) {
  await assertClientExists({ db, clientId });

  const importedKeywords = Array.isArray(payload?.keywords)
    ? payload.keywords.map(normalizeClientKeywordItem)
    : [];

  if (!importedKeywords.length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one keyword is required.",
    );
  }

  const existingRecord = await findClientKeywordsRecord({ db, clientId });
  const existingKeywords = mapClientKeywordRecord(existingRecord);
  const keywords = [...importedKeywords, ...existingKeywords];

  if (existingRecord) {
    await db.keywordContentList.update({
      where: { id: existingRecord.id },
      data: { keywordsJson: keywords },
    });
  } else {
    await db.keywordContentList.create({
      data: {
        clientId: BigInt(clientId),
        createdBy: actorUserId ? BigInt(actorUserId) : null,
        enableContentClustering: false,
        keywordsJson: keywords,
        location: CLIENT_KEYWORDS_LOCATION,
        topic: "Client Keywords",
      },
    });
  }

  return {
    keywords,
    total: keywords.length,
  };
}

async function deleteClientKeywords({ db, clientId, keywordIds }) {
  await assertClientExists({ db, clientId });

  const record = await findClientKeywordsRecord({ db, clientId });

  if (!record) {
    return { keywords: [], total: 0 };
  }

  const deleteIds = new Set(
    (Array.isArray(keywordIds) ? keywordIds : [keywordIds])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  if (!deleteIds.size) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one keyword id is required.",
    );
  }

  const keywords = mapClientKeywordRecord(record).filter(
    (keyword) => !deleteIds.has(keyword.id),
  );

  await db.keywordContentList.update({
    where: { id: record.id },
    data: { keywordsJson: keywords },
  });

  return {
    keywords,
    total: keywords.length,
  };
}

async function updateClientKeyword({ db, clientId, keywordId, payload }) {
  await assertClientExists({ db, clientId });

  const record = await findClientKeywordsRecord({ db, clientId });

  if (!record) {
    throw new AppError(404, "NOT_FOUND", "Keyword not found.");
  }

  const keywords = mapClientKeywordRecord(record);
  const targetKeywordId = String(keywordId || "").trim();
  const keywordIndex = keywords.findIndex(
    (keyword) => keyword.id === targetKeywordId,
  );

  if (keywordIndex === -1) {
    throw new AppError(404, "NOT_FOUND", "Keyword not found.");
  }

  const currentKeyword = keywords[keywordIndex];
  const updatedKeyword = normalizeClientKeywordItem({
    ...currentKeyword,
    ...payload,
    id: currentKeyword.id,
    keyword: currentKeyword.keyword,
  });
  const nextKeywords = [...keywords];

  nextKeywords[keywordIndex] = updatedKeyword;

  await db.keywordContentList.update({
    where: { id: record.id },
    data: { keywordsJson: nextKeywords },
  });

  return {
    keyword: updatedKeyword,
    keywords: nextKeywords,
    total: nextKeywords.length,
  };
}

function buildKeywordPatch(payload) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(payload, "contentType")) {
    patch.contentType = normalizeClientKeywordContentType(payload.contentType);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "useIn")) {
    patch.useIn = normalizeClientKeywordUseIn(payload.useIn);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    patch.status = normalizeClientKeywordStatus(payload.status);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "note")) {
    patch.note = parseOptionalString(payload.note) || "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "generatedTitle")) {
    patch.generatedTitle = parseOptionalString(payload.generatedTitle) || "";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "titleStatus")) {
    patch.titleStatus = normalizeClientKeywordTitleStatus(payload.titleStatus);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "titleError")) {
    patch.titleError = parseOptionalString(payload.titleError) || "";
  }

  return patch;
}

async function bulkUpdateClientKeywords({ db, clientId, keywordIds, patch }) {
  await assertClientExists({ db, clientId });

  const ids = new Set(
    (Array.isArray(keywordIds) ? keywordIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  if (!ids.size) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one keyword id is required.",
    );
  }

  const normalizedPatch = buildKeywordPatch(patch || {});

  if (Object.keys(normalizedPatch).length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "No supported fields provided in patch.",
    );
  }

  const record = await findClientKeywordsRecord({ db, clientId });

  if (!record) {
    throw new AppError(404, "NOT_FOUND", "Keywords not found.");
  }

  const keywords = mapClientKeywordRecord(record);
  let updatedCount = 0;
  const nextKeywords = keywords.map((current) => {
    if (!ids.has(current.id)) {
      return current;
    }

    updatedCount += 1;

    return normalizeClientKeywordItem({ ...current, ...normalizedPatch });
  });

  if (!updatedCount) {
    return { keywords, total: keywords.length, updatedCount: 0 };
  }

  await db.keywordContentList.update({
    where: { id: record.id },
    data: { keywordsJson: nextKeywords },
  });

  return {
    keywords: nextKeywords,
    total: nextKeywords.length,
    updatedCount,
  };
}

function emitClientKeywordEvent(io, clientId, event, payload) {
  if (!io) {
    return;
  }

  io.to(`client:${clientId}:keywords`).emit(event, payload);
}

async function patchSingleKeyword({
  db,
  clientId,
  recordId,
  keywordId,
  patch,
}) {
  const fresh = await db.keywordContentList.findUnique({
    where: { id: recordId },
  });

  if (!fresh) {
    return null;
  }

  const keywords = mapClientKeywordRecord(fresh);
  const index = keywords.findIndex((row) => row.id === keywordId);

  if (index === -1) {
    return null;
  }

  const updated = normalizeClientKeywordItem({ ...keywords[index], ...patch });
  const next = [...keywords];

  next[index] = updated;

  await db.keywordContentList.update({
    where: { id: recordId },
    data: { keywordsJson: next },
  });

  return updated;
}

async function generateOneTitleAndPersist({
  db,
  io,
  clientId,
  recordId,
  keywordId,
  env,
  requestedBy,
  client,
  promptRecord,
}) {
  const current = await patchSingleKeyword({
    db,
    clientId,
    recordId,
    keywordId,
    patch: { titleStatus: "GENERATING", titleError: "" },
  });

  if (!current) {
    return;
  }

  emitClientKeywordEvent(io, clientId, "client-keyword:title-progress", {
    keywordId,
    titleStatus: "GENERATING",
    generatedTitle: "",
    titleError: "",
  });

  try {
    const prompt = resolveMetaTitlePrompt({
      client,
      promptRecord,
      keyword: current.keyword,
      contentType: current.contentType,
    });
    const maxCharacters = Number(promptRecord.maxCharacter || 100);

    const result = await integrationsService.fetchManusGeneratedText({
      db,
      env,
      requestedBy,
      payload: {
        clientId,
        prompt,
        maxCharacters: Number.isFinite(maxCharacters) ? maxCharacters : 100,
        auditContext: {
          source: "CLIENT_KEYWORDS_TITLE_GENERATION",
          keywordId,
          promptId: promptRecord.id,
          promptType: META_TITLE_PROMPT_TYPE,
        },
      },
    });

    const rawTitle =
      typeof result?.text === "string"
        ? result.text
        : typeof result?.content === "string"
          ? result.content
          : "";
    const generatedTitle = String(rawTitle || "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .trim()
      .slice(0, 255);

    if (!generatedTitle) {
      throw new AppError(
        502,
        "TITLE_GENERATION_EMPTY",
        "AI returned an empty title.",
      );
    }

    const updated = await patchSingleKeyword({
      db,
      clientId,
      recordId,
      keywordId,
      patch: {
        titleStatus: "COMPLETED",
        titleError: "",
        generatedTitle,
      },
    });

    emitClientKeywordEvent(io, clientId, "client-keyword:title-progress", {
      keywordId,
      titleStatus: "COMPLETED",
      generatedTitle: updated?.generatedTitle ?? generatedTitle,
      titleError: "",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Title generation failed.";

    await patchSingleKeyword({
      db,
      clientId,
      recordId,
      keywordId,
      patch: { titleStatus: "FAILED", titleError: errorMessage },
    });

    emitClientKeywordEvent(io, clientId, "client-keyword:title-progress", {
      keywordId,
      titleStatus: "FAILED",
      generatedTitle: "",
      titleError: errorMessage,
    });
  }
}

async function runWithConcurrency(items, limit, worker) {
  if (!items.length) {
    return;
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;

      cursor += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(workers);
}

async function generateClientKeywordTitles({
  db,
  env,
  io,
  requestedBy,
  clientId,
  keywordIds,
}) {
  await assertClientExists({ db, clientId });

  const ids = Array.from(
    new Set(
      (Array.isArray(keywordIds) ? keywordIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );

  if (!ids.length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "At least one keyword id is required.",
    );
  }

  const record = await findClientKeywordsRecord({ db, clientId });

  if (!record) {
    throw new AppError(404, "NOT_FOUND", "Keywords not found.");
  }

  const keywords = mapClientKeywordRecord(record);
  const targets = keywords.filter((row) => ids.includes(row.id));

  if (!targets.length) {
    return {
      keywords,
      total: keywords.length,
      queuedCount: 0,
    };
  }

  const missingContentType = targets.find((row) => !row.contentType);

  if (missingContentType) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Content type is required before generating a title for "${missingContentType.keyword}".`,
    );
  }

  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
  });

  if (!client) {
    throw new AppError(404, "NOT_FOUND", "Client not found.");
  }

  const promptRecord = await db.aiPrompt.findFirst({
    where: {
      clientId: BigInt(clientId),
      status: "Active",
      typeOfPost: META_TITLE_PROMPT_TYPE,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!promptRecord?.prompt) {
    throw new AppError(
      400,
      "AI_PROMPT_NOT_FOUND",
      `No active AI Hub prompt found for "${META_TITLE_PROMPT_TYPE}". Create or activate one in Settings → AI Hub.`,
    );
  }

  // Mark all targets as GENERATING up-front so the UI sees the spinner
  // immediately, even before the first AI call finishes.
  const initialNext = keywords.map((row) =>
    ids.includes(row.id)
      ? normalizeClientKeywordItem({
          ...row,
          titleStatus: "GENERATING",
          titleError: "",
        })
      : row,
  );

  await db.keywordContentList.update({
    where: { id: record.id },
    data: { keywordsJson: initialNext },
  });

  // Kick off async generation without awaiting — the HTTP request returns
  // immediately, and the table fills in via socket events.
  setImmediate(() => {
    void runWithConcurrency(targets, TITLE_GENERATION_CONCURRENCY, (keyword) =>
      generateOneTitleAndPersist({
        db,
        io,
        clientId,
        recordId: record.id,
        keywordId: keyword.id,
        env,
        requestedBy,
        client,
        promptRecord,
      }),
    );
  });

  return {
    keywords: initialNext,
    total: initialNext.length,
    queuedCount: targets.length,
  };
}

module.exports = {
  bulkUpdateClientKeywords,
  deleteClientKeywords,
  generateClientKeywordTitles,
  importClientKeywords,
  listClientKeywords,
  updateClientKeyword,
};
