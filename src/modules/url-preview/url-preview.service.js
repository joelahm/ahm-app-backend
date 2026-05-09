const crypto = require('crypto');
const dns = require('dns/promises');
const net = require('net');
const { AppError } = require('../../lib/errors');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = 'AHMApp UrlPreview/1.0';
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);

function parsePreviewUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'url must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Only http and https URLs are supported.');
  }

  return parsed;
}

function parseIpv4(address) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function isBlockedIpv4(address) {
  const value = parseIpv4(address);
  if (value === null) return false;

  const ranges = [
    [parseIpv4('10.0.0.0'), 8],
    [parseIpv4('172.16.0.0'), 12],
    [parseIpv4('192.168.0.0'), 16],
    [parseIpv4('127.0.0.0'), 8],
    [parseIpv4('169.254.0.0'), 16],
  ];

  return ranges.some(([base, bits]) => {
    const mask = 0xffffffff << (32 - bits);
    return ((value & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

function normalizeIpv6(address) {
  return String(address || '').toLowerCase();
}

function isBlockedIpv6(address) {
  const normalized = normalizeIpv6(address);

  return normalized === '::1' || normalized.startsWith('fe80:');
}

function isBlockedAddress(address) {
  const family = net.isIP(address);

  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);

  return false;
}

async function assertPublicUrl(url) {
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL host is not allowed.');
  }

  const directIpFamily = net.isIP(hostname);
  if (directIpFamily && isBlockedAddress(hostname)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL host is not allowed.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL host could not be resolved.');
  }

  if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL host is not allowed.');
  }
}

function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function mapPreview(row) {
  return {
    url: row.url,
    title: row.title ?? null,
    description: row.description ?? null,
    image: row.image ?? null,
    siteName: row.siteName ?? null,
    fetchedAt: row.fetchedAt,
  };
}

function isFresh(row) {
  return row && Date.now() - new Date(row.fetchedAt).getTime() < CACHE_TTL_MS;
}

async function readResponseBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new AppError(400, 'VALIDATION_ERROR', 'URL response is too large.');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function fetchHtml(url, redirects = 0) {
  await assertPublicUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError(400, 'VALIDATION_ERROR', 'URL preview request timed out.');
    }
    throw new AppError(400, 'VALIDATION_ERROR', 'URL preview request failed.');
  } finally {
    clearTimeout(timeout);
  }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= MAX_REDIRECTS) {
      throw new AppError(400, 'VALIDATION_ERROR', 'URL has too many redirects.');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new AppError(400, 'VALIDATION_ERROR', 'URL redirect is missing a location.');
    }

    return fetchHtml(new URL(location, url), redirects + 1);
  }

  if (!response.ok) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL preview request failed.');
  }

  return {
    finalUrl: response.url || url.toString(),
    html: await readResponseBody(response),
  };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function readMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return null;
}

function readTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].replace(/\s+/g, ' ')) : null;
}

function absolutizeUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function parsePreview(html, baseUrl) {
  const title = readMeta(html, 'og:title') || readTitle(html);

  return {
    title: title ? title.slice(0, 500) : null,
    description: readMeta(html, 'og:description'),
    image: absolutizeUrl(readMeta(html, 'og:image'), baseUrl),
    siteName: readMeta(html, 'og:site_name')?.slice(0, 255) ?? null,
  };
}

async function getUrlPreview({ db, rawUrl }) {
  const parsedUrl = parsePreviewUrl(rawUrl);
  const canonicalUrl = parsedUrl.toString();
  const urlHash = hashUrl(canonicalUrl);
  const cached = await db.urlPreview.findUnique({ where: { urlHash } });

  if (isFresh(cached)) {
    return mapPreview(cached);
  }

  const { finalUrl, html } = await fetchHtml(parsedUrl);
  const preview = parsePreview(html, finalUrl);
  const saved = await db.urlPreview.upsert({
    where: { urlHash },
    create: {
      urlHash,
      url: canonicalUrl,
      title: preview.title,
      description: preview.description,
      image: preview.image,
      siteName: preview.siteName,
      fetchedAt: new Date(),
    },
    update: {
      title: preview.title,
      description: preview.description,
      image: preview.image,
      siteName: preview.siteName,
      fetchedAt: new Date(),
    },
  });

  return mapPreview(saved);
}

module.exports = {
  getUrlPreview,
};
