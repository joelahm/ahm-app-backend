const fetch = require('node-fetch');
const { URL } = require('url');

const UA = 'Mozilla/5.0 (compatible; AHM-WebsiteQA/1.0; +https://alliedhealthmedia.co.uk)';

const STOCK_HOST_PATTERNS = [
  /shutterstock\.com/i,
  /istockphoto\.com/i,
  /gettyimages\.com/i,
  /alamy\.com/i,
  /depositphotos\.com/i,
  /dreamstime\.com/i,
  /123rf\.com/i,
  /adobestock\.com/i,
  /unsplash\.com/i,
  /pexels\.com/i,
  /pixabay\.com/i,
  /freepik\.com/i,
  /googleusercontent\.com/i,
  /bing\.com\/th/i,
];

const STOCK_FILENAME_PATTERNS = [
  /shutterstock[_-]?\d+/i,
  /istock[_-]?\d+/i,
  /getty[_-]?\d+/i,
  /depositphotos[_-]?\d+/i,
  /stock[_-]?(photo|image)/i,
  /^\d{6,}\.(jpg|jpeg|png|webp)$/i,
  /^images?[_-]?\d+\.(jpg|jpeg|png|webp)$/i,
  /unsplash/i,
  /pexels/i,
];

const GENERIC_ALT_TEXT = new Set([
  'image',
  'photo',
  'picture',
  'banner',
  'logo',
  'icon',
]);

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : _;
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanTextFromHtml(value) {
  return decodeEntities(
    String(value || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1].trim()) : null;
}

function readNumericAttribute(tag, name) {
  const value = readAttribute(tag, name);
  if (!value) return null;
  const number = parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function hasAttribute(tag, name) {
  return new RegExp(`\\b${name}(?:\\s*=|\\s|>|$)`, 'i').test(String(tag || ''));
}

function getFilename(srcAbs) {
  try {
    return new URL(srcAbs).pathname.split('/').pop() || '';
  } catch {
    return '';
  }
}

function getExtension(srcAbs) {
  return getFilename(srcAbs).split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
}

function absoluteUrl(value, baseUrl) {
  if (!value || /^data:/i.test(value)) return null;
  let next = String(value).trim();
  if (next.startsWith('//')) next = 'https:' + next;
  try {
    return new URL(next, baseUrl).toString();
  } catch {
    return null;
  }
}

function highestSeverity(current, next) {
  const order = { pass: 0, suggestion: 1, warning: 2, critical: 3 };
  return order[next] > order[current] ? next : current;
}

function createIssue(ruleKey, severity, message, recommendation) {
  return { ruleKey, severity, message, recommendation };
}

function getFilenameStem(filename) {
  return String(filename || '')
    .replace(/\.[^.]+$/, '')
    .trim();
}

function getFilenameQualityIssues(filename, alt) {
  const issues = [];
  const stem = getFilenameStem(filename);
  const normalizedStem = normalizeText(stem);
  const normalizedAlt = normalizeText(alt);
  const words = normalizedStem.split(/\s+/).filter(Boolean);
  const hasReadableSeparators = /[-_]/.test(stem) || words.length > 1;

  if (!stem) return issues;

  if (/^(img|image|photo|picture|pic|dsc|screenshot|untitled|download|file|copy)([-_\s]?\d+)?$/i.test(stem)) {
    issues.push({
      ruleKey: 'GENERIC_IMAGE_FILENAME',
      message: 'Image filename is generic.',
      recommendation: 'Rename the image file with relevant, descriptive words before upload, such as the service, page topic, or subject.',
    });
  }

  if (/^[a-f0-9]{10,}$/i.test(stem) || /^[a-z0-9]{16,}$/i.test(stem) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(stem)) {
    issues.push({
      ruleKey: 'GIBBERISH_IMAGE_FILENAME',
      message: 'Image filename looks like a random or gibberish string.',
      recommendation: 'Use a meaningful filename that describes the image subject instead of hashes or random exports.',
    });
  }

  if (stem.length > 0 && !hasReadableSeparators && stem.length > 24) {
    issues.push({
      ruleKey: 'IMAGE_FILENAME_FORMAT',
      message: 'Image filename is hard to read.',
      recommendation: 'Use short, lowercase, hyphen-separated filenames that describe the image.',
    });
  }

  if (/[A-Z\s_]/.test(stem)) {
    issues.push({
      ruleKey: 'IMAGE_FILENAME_FORMAT',
      message: 'Image filename format can be improved.',
      recommendation: 'Use lowercase hyphen-separated filenames for cleaner, readable image URLs.',
    });
  }

  if (
    normalizedAlt &&
    normalizedStem &&
    words.length >= 2 &&
    !words.some((word) => normalizedAlt.includes(word))
  ) {
    issues.push({
      ruleKey: 'IRRELEVANT_IMAGE_FILENAME',
      message: 'Image filename does not appear relevant to the alt text.',
      recommendation: 'Use filenames that support the image topic and align naturally with the page context.',
    });
  }

  return issues;
}

function detectPlacement({ html, index, tag, src, wrapsAnchor, isBackground }) {
  if (isBackground) return 'background';

  const before = html.slice(0, index).toLowerCase();
  const after = html.slice(index).toLowerCase();
  const context = `${html.slice(Math.max(0, index - 1200), index)} ${tag || ''}`.toLowerCase();
  const filename = getFilename(src).toLowerCase();
  const isInside = (name) => {
    const openIndex = before.lastIndexOf(`<${name}`);
    const closeIndex = before.lastIndexOf(`</${name}>`);
    const nextCloseIndex = after.indexOf(`</${name}>`);

    return openIndex > closeIndex && nextCloseIndex !== -1;
  };

  if (/logo|brand|site-logo|custom-logo|navbar-brand/.test(`${context} ${filename}`)) return 'logo';
  if (/icon|sprite|avatar|emoji/.test(`${context} ${filename}`)) return 'icon';
  if (/hero|banner|masthead|above-the-fold|home-intro/.test(context)) return 'hero';
  if (/gallery|carousel|slider|swiper/.test(context)) return 'gallery';
  if (isInside('footer')) return 'footer';
  if (isInside('aside') || /sidebar|widget-area/.test(context)) return 'sidebar';
  if (wrapsAnchor) return 'image_link';

  return 'main_content';
}

function isDecorativeImage(image) {
  if (image.ariaHidden || image.role === 'presentation' || image.role === 'none') return true;
  if (image.placement === 'icon') return true;
  if (image.placement === 'logo') return false;
  if (image.wrapsAnchor) return false;
  if (/spacer|divider|separator|decor|shape|pattern|background|lazy-placeholder/i.test(`${image.className || ''} ${image.src || ''}`)) {
    return true;
  }
  return image.width !== null && image.height !== null && image.width <= 32 && image.height <= 32;
}

function keywordRepeatCount(value) {
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  const counts = new Map();
  let highest = 0;

  words.forEach((word) => {
    if (word.length <= 2) return;
    const count = (counts.get(word) || 0) + 1;
    counts.set(word, count);
    highest = Math.max(highest, count);
  });

  return highest;
}

function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(re);
  if (match) return decodeEntities(match[1].trim());
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  const match2 = html.match(re2);
  return match2 ? decodeEntities(match2[1].trim()) : null;
}

function detectSchemaTypes(html) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const types = new Set();
  let hasImage = false;

  scripts.forEach((script) => {
    const text = cleanTextFromHtml(script);
    const matches = text.match(/"@type"\s*:\s*"?([A-Za-z]+)"?/g) || [];
    matches.forEach((entry) => {
      const match = entry.match(/"@type"\s*:\s*"?([A-Za-z]+)"?/);
      if (match?.[1]) types.add(match[1]);
    });
    if (/"image"\s*:/i.test(text)) hasImage = true;
  });

  return { types: Array.from(types), hasImage };
}

function getHost(src) {
  try {
    return new URL(src).hostname;
  } catch {
    return '';
  }
}

function extractImages(html, baseUrl) {
  const out = [];
  const re = /<img\b[^>]*>/gi;
  let match;
  const baseHost = getHost(baseUrl);

  while ((match = re.exec(html))) {
    const tag = match[0];
    const rawSrc =
      readAttribute(tag, 'src') ||
      readAttribute(tag, 'data-src') ||
      readAttribute(tag, 'data-lazy-src');
    const src = absoluteUrl(rawSrc, baseUrl);
    if (!src) continue;

    const alt = readAttribute(tag, 'alt');
    const width = readNumericAttribute(tag, 'width');
    const height = readNumericAttribute(tag, 'height');
    const style = readAttribute(tag, 'style') || '';
    const className = readAttribute(tag, 'class') || '';
    const role = (readAttribute(tag, 'role') || '').toLowerCase();
    const ariaHidden = /^true$/i.test(readAttribute(tag, 'aria-hidden') || '');
    const before = html.slice(Math.max(0, match.index - 250), match.index).toLowerCase();
    const wrapsAnchor = before.lastIndexOf('<a') > before.lastIndexOf('</a>');
    const placement = detectPlacement({ html, index: match.index, tag, src, wrapsAnchor, isBackground: false });
    const host = getHost(src);

    out.push({
      index: out.length,
      src,
      alt: alt ?? '',
      hasAltAttribute: alt !== null,
      width,
      height,
      loading: readAttribute(tag, 'loading') || '',
      fetchPriority: readAttribute(tag, 'fetchpriority') || readAttribute(tag, 'fetchPriority') || '',
      srcset: readAttribute(tag, 'srcset') || readAttribute(tag, 'data-srcset') || '',
      sizes: readAttribute(tag, 'sizes') || '',
      style,
      className,
      role,
      ariaHidden,
      hasAspectRatio: /aspect-ratio\s*:/i.test(style),
      wrapsAnchor,
      external: Boolean(host && baseHost && host !== baseHost && !host.endsWith(baseHost)),
      placement,
      isBackground: false,
    });
  }

  const backgroundRe = /background(?:-image)?\s*:\s*[^;]*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = backgroundRe.exec(html))) {
    const src = absoluteUrl(match[1], baseUrl);
    if (!src) continue;
    const host = getHost(src);

    out.push({
      index: out.length,
      src,
      alt: '',
      hasAltAttribute: false,
      width: null,
      height: null,
      loading: '',
      fetchPriority: '',
      srcset: '',
      sizes: '',
      style: '',
      className: '',
      role: '',
      ariaHidden: false,
      hasAspectRatio: false,
      wrapsAnchor: false,
      external: Boolean(host && baseHost && host !== baseHost && !host.endsWith(baseHost)),
      placement: 'background',
      isBackground: true,
    });
  }

  return out;
}

async function fetchImageMeta(src) {
  if (!/^https?:\/\//i.test(src)) {
    return { statusCode: null, sizeBytes: null, contentType: '', error: 'Invalid URL' };
  }

  try {
    let usedGet = false;
    let res = await fetch(src, {
      method: 'HEAD',
      timeout: 7000,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
    });

    if (res.status === 403 || res.status === 405) {
      usedGet = true;
      res = await fetch(src, {
        method: 'GET',
        timeout: 7000,
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
      });
    }

    let length = parseInt(res.headers.get('content-length') || '', 10);

    if ((!Number.isFinite(length) || length <= 0) && usedGet && res.ok) {
      const buffer = await res.arrayBuffer();
      length = buffer.byteLength;
    }

    return {
      statusCode: res.status,
      sizeBytes: Number.isFinite(length) ? length : null,
      contentType: res.headers.get('content-type') || '',
      error: null,
    };
  } catch (error) {
    return {
      statusCode: null,
      sizeBytes: null,
      contentType: '',
      error: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    };
  }
}

async function annotateImageMeta(images) {
  const maxChecks = parseInt(process.env.QA_IMAGE_STATUS_MAX_CHECKS || '80', 10);
  const checked = images.slice(0, Number.isFinite(maxChecks) && maxChecks > 0 ? maxChecks : 80);
  const results = new Map();
  const batchSize = 5;

  for (let index = 0; index < checked.length; index += batchSize) {
    const batch = checked.slice(index, index + batchSize);
    const metas = await Promise.all(batch.map((image) => fetchImageMeta(image.src)));

    batch.forEach((image, metaIndex) => {
      results.set(image.src, metas[metaIndex]);
    });
  }

  return images.map((image) => ({
    ...image,
    ...(results.get(image.src) || {
      statusCode: null,
      sizeBytes: null,
      contentType: '',
      statusError: 'Not checked',
    }),
  }));
}

function flagStockImage(srcAbs, alt) {
  const flags = [];
  const host = getHost(srcAbs);
  const filename = getFilename(srcAbs);

  for (const re of STOCK_HOST_PATTERNS) if (re.test(host)) flags.push(`Stock host: ${host}`);
  for (const re of STOCK_FILENAME_PATTERNS) {
    if (re.test(filename)) {
      flags.push(`Stock filename: ${filename}`);
      break;
    }
  }

  if (!alt || alt.trim().length === 0) flags.push(`Missing alt: ${filename || host}`);
  return flags;
}

function analyzeImage(image, duplicateAltCounts) {
  const issues = [];
  const recommendations = [];
  const ext = getExtension(image.src);
  const filename = getFilename(image.src);
  const isSvg = ext === 'svg' || /svg/i.test(image.contentType || '');
  const isDecorative = isDecorativeImage(image);
  const isImportant = ['hero', 'main_content', 'image_link', 'gallery', 'logo'].includes(image.placement);
  const alt = String(image.alt || '').trim();
  let severity = 'pass';

  const add = (ruleKey, nextSeverity, message, recommendation) => {
    issues.push(createIssue(ruleKey, nextSeverity, message, recommendation));
    recommendations.push(recommendation);
    severity = highestSeverity(severity, nextSeverity);
  };

  if (!image.hasAltAttribute) {
    add(
      'MISSING_ALT_ATTRIBUTE',
      isImportant || image.wrapsAnchor ? 'critical' : 'warning',
      'Image is missing an alt attribute.',
      'Add descriptive alt text that explains the image in context, or alt="" only if it is decorative.',
    );
  } else if (!alt && !isDecorative) {
    add(
      'MEANINGFUL_IMAGE_EMPTY_ALT',
      isImportant || image.wrapsAnchor ? 'critical' : 'warning',
      'Meaningful image has empty alt text.',
      'Add descriptive alt text for content, linked, logo, hero, and gallery images.',
    );
  }

  if (alt && GENERIC_ALT_TEXT.has(normalizeText(alt))) {
    add(
      'GENERIC_ALT_TEXT',
      'warning',
      'Alt text is too generic.',
      'Use specific, descriptive alt text that explains this exact image.',
    );
  }

  if (alt && keywordRepeatCount(alt) >= 2 && alt.length > 35) {
    add(
      'KEYWORD_STUFFED_ALT_TEXT',
      'warning',
      'Alt text appears keyword-stuffed.',
      'Rewrite alt text naturally for users and accessibility.',
    );
  }

  const normalizedAlt = normalizeText(alt);
  if (normalizedAlt && duplicateAltCounts.get(normalizedAlt) > 1 && !isDecorative && image.placement !== 'icon') {
    add(
      'DUPLICATE_ALT_TEXT',
      image.placement === 'main_content' || image.placement === 'hero' ? 'warning' : 'suggestion',
      'Alt text is repeated on multiple meaningful images.',
      'Use unique alt text where each image communicates different information.',
    );
  }

  if (!isDecorative && !['logo', 'icon'].includes(image.placement)) {
    getFilenameQualityIssues(filename, alt).forEach((issue) => {
      add(
        issue.ruleKey,
        'suggestion',
        issue.message,
        issue.recommendation,
      );
    });
  }

  if (image.error && image.error !== 'Not checked') {
    add(
      'IMAGE_STATUS_CHECK_FAILED',
      'critical',
      'Image URL could not be checked.',
      'Review this image URL and replace it if it is unavailable.',
    );
  }

  if (typeof image.statusCode === 'number' && image.statusCode >= 400) {
    add(
      'BROKEN_IMAGE_URL',
      'critical',
      `Image returns HTTP ${image.statusCode}.`,
      'Fix or replace the broken image.',
    );
  }

  if (!image.isBackground && !image.width && !image.height && !image.hasAspectRatio) {
    add(
      'MISSING_IMAGE_DIMENSIONS',
      isImportant ? 'warning' : 'suggestion',
      'Image does not reserve width/height or aspect ratio.',
      'Add width and height attributes or CSS aspect-ratio to reduce layout shift.',
    );
  }

  if (typeof image.sizeBytes === 'number') {
    if (image.sizeBytes > 1024 * 1024) {
      add(
        'VERY_LARGE_IMAGE_FILE',
        isImportant ? 'critical' : 'warning',
        'Image file is larger than 1MB.',
        'Compress the image and serve an optimized version.',
      );
    } else if (image.sizeBytes > 500 * 1024) {
      add(
        'LARGE_IMAGE_FILE',
        'warning',
        'Image file is larger than 500KB.',
        'Compress the image and consider WebP/AVIF delivery.',
      );
    } else if (image.sizeBytes > 300 * 1024) {
      add(
        'IMAGE_FILE_CAN_BE_SMALLER',
        'suggestion',
        'Image file is larger than 300KB.',
        'Compress the image further where quality allows.',
      );
    }
  }

  if (typeof image.sizeBytes === 'number' && image.sizeBytes > 300 * 1024 && ['jpg', 'jpeg', 'png'].includes(ext)) {
    add(
      'INEFFICIENT_IMAGE_FORMAT',
      'suggestion',
      'Large image uses JPEG/PNG.',
      'Use WebP or AVIF where suitable; keep SVG for icons and PNG only where transparency is needed.',
    );
  }

  if (!image.isBackground && isImportant && !image.srcset && !image.sizes && ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext)) {
    add(
      'MISSING_RESPONSIVE_IMAGE_SUPPORT',
      'warning',
      'Image does not include responsive srcset/sizes.',
      'Use srcset and sizes for responsive image delivery.',
    );
  }

  if (image.placement === 'hero') {
    if (/lazy/i.test(image.loading)) {
      add(
        'HERO_IMAGE_LAZY_LOADED',
        'critical',
        'Hero/LCP image is lazy loaded.',
        'Do not lazy-load the hero image; use eager loading and consider fetchpriority="high".',
      );
    }

    if (!/high/i.test(image.fetchPriority || '')) {
      add(
        'HERO_IMAGE_NO_FETCH_PRIORITY',
        'suggestion',
        'Hero image does not set high fetch priority.',
        'Consider fetchpriority="high" or preload if this is the LCP image.',
      );
    }
  } else if (!image.isBackground && !/lazy/i.test(image.loading) && ['main_content', 'gallery', 'footer', 'sidebar'].includes(image.placement)) {
    add(
      'MISSING_LAZY_LOADING',
      'suggestion',
      'Non-critical image is not lazy loaded.',
      'Add loading="lazy" to below-the-fold images.',
    );
  }

  if (image.isBackground) {
    add(
      'CONTENT_IMAGE_AS_BACKGROUND',
      'suggestion',
      'Image is embedded as a CSS background.',
      'If this image is meaningful content, use a standard img or picture element so search engines can discover it.',
    );
  }

  if (image.wrapsAnchor && !alt) {
    add(
      'LINKED_IMAGE_MISSING_ALT',
      'warning',
      'Linked image is missing alt text.',
      'Add alt text describing the linked destination or image purpose.',
    );
  }

  if (isSvg && /<script|onload=|onclick=|onerror=|javascript:/i.test(`${image.src} ${image.raw || ''}`)) {
    add(
      'UNSAFE_SVG_USAGE',
      'critical',
      'SVG may contain unsafe script or event handlers.',
      'Sanitize SVG files before use.',
    );
  }

  flagStockImage(image.src, alt).forEach((flag) => {
    if (/missing alt/i.test(flag)) return;
    add(
      'STOCK_IMAGE_SIGNAL',
      'suggestion',
      flag,
      'Use original, relevant imagery where possible and keep filenames descriptive.',
    );
  });

  return {
    ...image,
    filename,
    issues,
    recommendations: Array.from(new Set(recommendations)),
    severity,
    statusError: image.error || null,
    flags: issues.map((issue) => issue.message),
  };
}

function scoreImages(items, pageIssues) {
  const weights = {
    alt: 25,
    performance: 30,
    responsive: 15,
    layout: 15,
    crawlability: 10,
    social: 5,
  };
  const penalties = {
    critical: 1,
    warning: 0.55,
    suggestion: 0.25,
  };
  const buckets = {
    alt: ['MISSING_ALT_ATTRIBUTE', 'MEANINGFUL_IMAGE_EMPTY_ALT', 'GENERIC_ALT_TEXT', 'KEYWORD_STUFFED_ALT_TEXT', 'DUPLICATE_ALT_TEXT', 'LINKED_IMAGE_MISSING_ALT'],
    performance: ['IMAGE_STATUS_CHECK_FAILED', 'BROKEN_IMAGE_URL', 'VERY_LARGE_IMAGE_FILE', 'LARGE_IMAGE_FILE', 'IMAGE_FILE_CAN_BE_SMALLER', 'INEFFICIENT_IMAGE_FORMAT', 'HERO_IMAGE_LAZY_LOADED'],
    responsive: ['MISSING_RESPONSIVE_IMAGE_SUPPORT'],
    layout: ['MISSING_IMAGE_DIMENSIONS'],
    crawlability: ['CONTENT_IMAGE_AS_BACKGROUND', 'UNSAFE_SVG_USAGE'],
    social: [
      'MISSING_OPEN_GRAPH_IMAGE',
      'SCHEMA_IMAGE_MISSING',
      'GENERIC_IMAGE_FILENAME',
      'GIBBERISH_IMAGE_FILENAME',
      'IMAGE_FILENAME_FORMAT',
      'IRRELEVANT_IMAGE_FILENAME',
    ],
  };

  const allIssues = [...items.flatMap((item) => item.issues || []), ...pageIssues];
  let score = 100;

  Object.entries(buckets).forEach(([bucket, ruleKeys]) => {
    const bucketIssues = allIssues.filter((issue) => ruleKeys.includes(issue.ruleKey));
    if (!bucketIssues.length) return;
    const impact = Math.min(
      1,
      bucketIssues.reduce((sum, issue) => sum + (penalties[issue.severity] || 0.15), 0) / Math.max(1, items.length || 1),
    );
    score -= weights[bucket] * impact;
  });

  return Math.max(0, Math.round(score));
}

async function auditPageImages(html, baseUrl) {
  const extracted = extractImages(html, baseUrl);
  const images = await annotateImageMeta(extracted);
  const duplicateAltCounts = new Map();

  images.forEach((image) => {
    const alt = normalizeText(image.alt);
    if (!alt) return;
    duplicateAltCounts.set(alt, (duplicateAltCounts.get(alt) || 0) + 1);
  });

  const items = images.map((image) => analyzeImage(image, duplicateAltCounts));
  const pageIssues = [];
  const ogImage = extractMeta(html, 'og:image');
  const schema = detectSchemaTypes(html);
  const schemaNeedsImage = schema.types.some((type) =>
    ['Article', 'Product', 'Recipe', 'LocalBusiness', 'Service', 'MedicalBusiness', 'MedicalClinic', 'Physician'].includes(type),
  );

  if (!ogImage) {
    pageIssues.push(createIssue(
      'MISSING_OPEN_GRAPH_IMAGE',
      'suggestion',
      'Page is missing og:image.',
      'Add an Open Graph image for better social sharing.',
    ));
  }

  if (schemaNeedsImage && !schema.hasImage) {
    pageIssues.push(createIssue(
      'SCHEMA_IMAGE_MISSING',
      'suggestion',
      'Structured data does not include an image.',
      'Add an image property to article, product, local business, service, or medical schema where relevant.',
    ));
  }

  const externalCount = items.filter((image) => image.external).length;
  const flagged = items.filter((image) => image.severity !== 'pass');
  const score = scoreImages(items, pageIssues);

  return {
    total: items.length,
    externalCount,
    flagged,
    items,
    pageIssues,
    score,
  };
}

module.exports = { auditPageImages, extractImages };
