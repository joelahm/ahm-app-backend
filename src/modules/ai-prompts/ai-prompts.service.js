const { randomInt, randomUUID } = require('crypto');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');

const AI_PROMPTS_COUNTER_KEY = 'ai_prompt_counter';
const AI_PROMPTS_SETTINGS_KEY = 'ai_prompts';
const MIN_PROMPT_ID = 100000000;
const MAX_PROMPT_ID = 999999999;
const ALLOWED_PROMPT_STATUSES = new Set(['Draft', 'Active']);

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

function generateRandomPromptId() {
  return randomInt(MIN_PROMPT_ID, MAX_PROMPT_ID + 1);
}

function parseUnsignedBigInt(value, fieldName) {
  const normalized = asString(value).trim();

  if (!/^\d+$/.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }

  return BigInt(normalized);
}

function buildUserDisplayName(user) {
  const firstName = asString(user?.firstName).trim();
  const lastName = asString(user?.lastName).trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || asString(user?.email) || 'Unknown';
}

function normalizeAttachment(value, index) {
  const source = asObject(value);
  const name = asString(source.name).trim();

  return {
    id: asString(source.id) || `attachment-${index + 1}`,
    name: name || `Attachment ${index + 1}`,
    size: Math.max(0, asNumber(source.size, 0)),
    type: asString(source.type)
  };
}

function normalizeStoredPrompt(value) {
  const source = asObject(value);
  const createdBy = asObject(source.createdBy);
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.map((attachment, index) => normalizeAttachment(attachment, index))
    : [];
  const customValues = Array.isArray(source.customValues)
    ? source.customValues
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim())
    : [];
  const prompt = asString(source.prompt);
  const typeOfPost = asString(source.typeOfPost || source.name);

  return {
    id: asString(source.id) || `prompt-${randomUUID()}`,
    uniqueId: asString(source.uniqueId),
    name: asString(source.name) || typeOfPost,
    purpose: asString(source.purpose) || prompt.slice(0, 120),
    status: asString(source.status) || 'Draft',
    typeOfPost,
    clientId: asString(source.clientId),
    customValues,
    maxCharacter: asString(source.maxCharacter),
    prompt,
    attachments,
    createdAt: asString(source.createdAt) || new Date().toISOString(),
    updatedAt:
      asString(source.updatedAt) ||
      asString(source.createdAt) ||
      new Date().toISOString(),
    createdBy: {
      id: asNumber(createdBy.id, 0),
      name: asString(createdBy.name),
      email: asString(createdBy.email)
    }
  };
}

function parseStoredAiPromptsValue(value) {
  const root = asObject(value);
  const rawPrompts = Array.isArray(root.aiPrompts) ? root.aiPrompts : [];

  return {
    aiPrompts: rawPrompts
      .map((item) => normalizeStoredPrompt(item))
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )
  };
}

function normalizeCreateAiPromptPayload(payload) {
  const source = asObject(payload);
  const uniqueId = asString(source.uniqueId).trim();
  const typeOfPost = asString(source.typeOfPost).trim();
  const prompt = asString(source.prompt).trim();
  const clientId = asString(source.clientId).trim();
  const maxCharacter = asString(source.maxCharacter).trim();
  const status = asString(source.status || 'Draft').trim();
  const customValues = Array.isArray(source.customValues)
    ? source.customValues
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim())
    : [];
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.map((attachment, index) => normalizeAttachment(attachment, index))
    : [];

  if (!uniqueId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Unique ID Prompt is required.');
  }

  if (!typeOfPost) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Type of post is required.');
  }

  if (!prompt) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Prompt is required.');
  }

  if (!clientId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Client name is required.');
  }

  if (!maxCharacter) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Max character is required.');
  }

  if (!ALLOWED_PROMPT_STATUSES.has(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid AI prompt status.');
  }

  return {
    attachments,
    clientId,
    customValues,
    maxCharacter,
    prompt,
    status,
    typeOfPost,
    uniqueId
  };
}

function mapAiPromptRecord(record) {
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.map((attachment, index) => normalizeAttachment(attachment, index))
    : [];
  const customValues = Array.isArray(record.customValues)
    ? record.customValues.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
  const prompt = asString(record.prompt);
  const typeOfPost = asString(record.typeOfPost);

  return {
    id: asString(record.id),
    uniqueId: asString(record.uniqueId),
    name: asString(record.name) || typeOfPost,
    purpose: asString(record.purpose) || prompt.slice(0, 120),
    status: asString(record.status) || 'Draft',
    typeOfPost,
    clientId: String(record.clientId),
    customValues,
    maxCharacter: asString(record.maxCharacter),
    prompt,
    attachments,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : asString(record.createdAt),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : asString(record.updatedAt),
    createdBy: {
      id: record.creator?.id ? Number(record.creator.id) : 0,
      name: buildUserDisplayName(record.creator),
      email: asString(record.creator?.email)
    }
  };
}

async function migrateLegacyAiPromptsIfNeeded({ db }) {
  const currentCount = await db.aiPrompt.count();

  if (currentCount > 0) {
    return;
  }

  const setting = await db.appSetting.findUnique({
    where: { key: AI_PROMPTS_SETTINGS_KEY }
  });

  if (!setting) {
    return;
  }

  const legacyPrompts = parseStoredAiPromptsValue(setting.valueJson).aiPrompts;

  if (!legacyPrompts.length) {
    return;
  }

  for (const prompt of legacyPrompts) {
    if (!/^\d+$/.test(prompt.clientId)) {
      continue;
    }

    const clientId = BigInt(prompt.clientId);
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true }
    });

    if (!client) {
      continue;
    }

    let createdBy = null;
    const createdById = prompt.createdBy?.id;
    if (Number.isFinite(createdById) && createdById > 0) {
      const creator = await db.user.findUnique({ where: { id: BigInt(createdById) }, select: { id: true } });
      createdBy = creator ? BigInt(createdById) : null;
    }

    await db.aiPrompt.upsert({
      where: { id: prompt.id },
      create: {
        id: prompt.id,
        uniqueId: prompt.uniqueId,
        name: prompt.name,
        purpose: prompt.purpose,
        status: prompt.status,
        typeOfPost: prompt.typeOfPost,
        clientId,
        customValues: prompt.customValues,
        maxCharacter: prompt.maxCharacter,
        prompt: prompt.prompt,
        attachments: prompt.attachments,
        createdBy,
        createdAt: new Date(prompt.createdAt),
        updatedAt: new Date(prompt.updatedAt)
      },
      update: {
        uniqueId: prompt.uniqueId,
        name: prompt.name,
        purpose: prompt.purpose,
        status: prompt.status,
        typeOfPost: prompt.typeOfPost,
        clientId,
        customValues: prompt.customValues,
        maxCharacter: prompt.maxCharacter,
        prompt: prompt.prompt,
        attachments: prompt.attachments,
        createdBy,
        createdAt: new Date(prompt.createdAt),
        updatedAt: new Date(prompt.updatedAt)
      }
    });
  }
}

async function getAiPrompts({ db }) {
  await migrateLegacyAiPromptsIfNeeded({ db });

  const aiPrompts = await db.aiPrompt.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    }
  });

  return { aiPrompts: aiPrompts.map((record) => mapAiPromptRecord(record)) };
}

async function reserveNextPromptId({ db }) {
  await migrateLegacyAiPromptsIfNeeded({ db });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const next = generateRandomPromptId();
    const exists = await db.aiPrompt.findUnique({
      where: { uniqueId: String(next) },
      select: { id: true }
    });

    if (!exists) {
      return { uniqueId: String(next) };
    }
  }

  throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to generate a unique prompt ID.');
}

async function createPrompt({ db, actorUserId, payload }) {
  await migrateLegacyAiPromptsIfNeeded({ db });
  const normalizedPayload = normalizeCreateAiPromptPayload(payload);
  const clientId = parseUnsignedBigInt(normalizedPayload.clientId, 'Client');
  const createdBy = actorUserId ? BigInt(actorUserId) : null;

  try {
    const aiPrompt = await db.aiPrompt.create({
      data: {
        id: `prompt-${randomUUID()}`,
        uniqueId: normalizedPayload.uniqueId,
        name: normalizedPayload.typeOfPost,
        purpose: normalizedPayload.prompt.slice(0, 120),
        status: normalizedPayload.status,
        typeOfPost: normalizedPayload.typeOfPost,
        clientId,
        customValues: normalizedPayload.customValues,
        maxCharacter: normalizedPayload.maxCharacter,
        prompt: normalizedPayload.prompt,
        attachments: normalizedPayload.attachments,
        createdBy
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });

    return { success: true, aiPrompt: mapAiPromptRecord(aiPrompt) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Unique prompt ID already exists.');
    }
    throw err;
  }
}

async function updatePrompt({ db, promptId, payload }) {
  await migrateLegacyAiPromptsIfNeeded({ db });
  const normalizedPayload = normalizeCreateAiPromptPayload(payload);
  const clientId = parseUnsignedBigInt(normalizedPayload.clientId, 'Client');

  const existingPrompt = await db.aiPrompt.findUnique({ where: { id: promptId }, select: { id: true } });
  if (!existingPrompt) {
    throw new AppError(404, 'NOT_FOUND', 'AI prompt not found.');
  }

  try {
    const aiPrompt = await db.aiPrompt.update({
      where: { id: promptId },
      data: {
        uniqueId: normalizedPayload.uniqueId,
        name: normalizedPayload.typeOfPost,
        purpose: normalizedPayload.prompt.slice(0, 120),
        status: normalizedPayload.status,
        typeOfPost: normalizedPayload.typeOfPost,
        clientId,
        customValues: normalizedPayload.customValues,
        maxCharacter: normalizedPayload.maxCharacter,
        prompt: normalizedPayload.prompt,
        attachments: normalizedPayload.attachments
      },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });

    return { success: true, aiPrompt: mapAiPromptRecord(aiPrompt) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Unique prompt ID already exists.');
    }
    throw err;
  }
}

module.exports = {
  createPrompt,
  getAiPrompts,
  reserveNextPromptId,
  updatePrompt
};
