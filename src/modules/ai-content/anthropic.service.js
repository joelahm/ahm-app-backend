const { AppError } = require('../../lib/errors');

const ANTHROPIC_VERSION = '2023-06-01';

const DEFAULT_MEDICAL_WEBSITE_SYSTEM_PROMPT = [
  'You generate draft website content for medical and healthcare businesses.',
  'The content is for clinician review before publication.',
  'Write patient-friendly, accurate, non-alarmist content.',
  'Do not diagnose, prescribe, guarantee outcomes, or replace professional medical advice.',
  'Encourage readers to consult the clinic or their clinician for personal advice.',
  'For urgent or emergency symptoms, tell readers to seek urgent medical care.',
  'Avoid unsupported claims and avoid inventing credentials, prices, statistics, citations, or treatments.',
].join(' ');

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

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readTemperature(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function resolveAnthropicConfig(env) {
  const config = env?.integrations?.anthropic || {};
  const apiKey = optionalString(config.apiKey);

  if (!apiKey) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'ANTHROPIC_API_KEY is required.');
  }

  return {
    apiKey,
    baseUrl: optionalString(config.baseUrl) || 'https://api.anthropic.com',
    maxOutputTokens: readPositiveInteger(config.maxOutputTokens, 4096),
    model: optionalString(config.model) || 'claude-sonnet-4-20250514',
  };
}

function buildMedicalWebsiteUserPrompt({
  audience,
  businessName,
  contentLength,
  contentType,
  extraInstructions,
  keyword,
  prompt,
  topic,
}) {
  const sections = [
    `Primary request:\n${requireString(prompt, 'prompt')}`,
  ];
  const context = [
    ['Business name', businessName],
    ['Keyword', keyword],
    ['Topic', topic],
    ['Content type', contentType],
    ['Content length', contentLength],
    ['Audience', audience],
  ]
    .map(([label, value]) => {
      const normalized = optionalString(value);

      return normalized ? `${label}: ${normalized}` : null;
    })
    .filter(Boolean);

  if (context.length) {
    sections.push(`Context:\n${context.join('\n')}`);
  }

  const normalizedInstructions = optionalString(extraInstructions);

  if (normalizedInstructions) {
    sections.push(`Additional instructions:\n${normalizedInstructions}`);
  }

  return sections.join('\n\n');
}

function extractAnthropicText(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : [];

  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function buildAnthropicErrorMessage(payload, fallback) {
  return (
    optionalString(payload?.error?.message) ||
    optionalString(payload?.message) ||
    fallback
  );
}

async function generateMedicalWebsiteContent({
  audience,
  businessName,
  contentLength,
  contentType,
  env,
  extraInstructions,
  keyword,
  maxOutputTokens,
  model,
  prompt,
  systemPrompt,
  temperature,
  topic,
}) {
  const config = resolveAnthropicConfig(env);
  const resolvedPrompt = buildMedicalWebsiteUserPrompt({
    audience,
    businessName,
    contentLength,
    contentType,
    extraInstructions,
    keyword,
    prompt,
    topic,
  });
  const resolvedModel = optionalString(model) || config.model;
  const resolvedMaxOutputTokens = readPositiveInteger(maxOutputTokens, config.maxOutputTokens);
  const resolvedTemperature = readTemperature(temperature, 0.4);
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const requestPayload = {
    max_tokens: resolvedMaxOutputTokens,
    messages: [
      {
        content: resolvedPrompt,
        role: 'user',
      },
    ],
    model: resolvedModel,
    system: optionalString(systemPrompt) || DEFAULT_MEDICAL_WEBSITE_SYSTEM_PROMPT,
    temperature: resolvedTemperature,
  };

  let response;
  let responsePayload;

  try {
    response = await fetch(endpoint, {
      body: JSON.stringify(requestPayload),
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
      },
      method: 'POST',
    });
    responsePayload = await response.json().catch(() => null);
  } catch (error) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', 'Anthropic request failed.', {
      cause: error instanceof Error ? error.message : String(error),
      provider: 'ANTHROPIC',
    });
  }

  const text = extractAnthropicText(responsePayload);

  if (!response.ok || !text) {
    throw new AppError(
      502,
      'UPSTREAM_API_ERROR',
      buildAnthropicErrorMessage(responsePayload, 'Anthropic did not return assistant content.'),
      {
        provider: 'ANTHROPIC',
        stopReason: responsePayload?.stop_reason ?? null,
        upstreamStatus: response.status,
      },
    );
  }

  return {
    model: resolvedModel,
    provider: 'ANTHROPIC',
    stopReason: responsePayload?.stop_reason ?? null,
    text,
    usage: {
      inputTokens: responsePayload?.usage?.input_tokens ?? null,
      outputTokens: responsePayload?.usage?.output_tokens ?? null,
    },
  };
}

module.exports = {
  DEFAULT_MEDICAL_WEBSITE_SYSTEM_PROMPT,
  generateMedicalWebsiteContent,
};
