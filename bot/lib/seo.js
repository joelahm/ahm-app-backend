const fetch = require('node-fetch');

const UA = 'Mozilla/5.0 (compatible; AHM-WebsiteQA/1.0; +https://alliedhealthmedia.co.uk)';

function decodeEntities(s) {
  if (!s) return s;
  return s
    // Numeric decimal: &#38; → &, &#8217; → ’
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : _;
    })
    // Numeric hex: &#x27; → '
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

async function fetchHtml(url) {
  const res = await fetch(url, {
    timeout: 30 * 1000,
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  const html = await res.text();
  return { status: res.status, finalUrl: res.url, html, contentType: res.headers.get('content-type') || '' };
}

function extractTag(html, regex) {
  const m = html.match(regex);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return decodeEntities(m[1].trim());
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1].trim()) : null;
}

function countMatches(html, re) {
  return (html.match(re) || []).length;
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

function countWords(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/).length : 0;
}

function includesNormalized(value, needle) {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return normalizeText(value).includes(normalizedNeedle);
}

function stripHtmlToText(html) {
  return cleanTextFromHtml(
    String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' '),
  );
}

function extractBodyHtml(html) {
  const match = String(html || '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : String(html || '');
}

function extractFirstParagraphText(html) {
  const body = extractBodyHtml(html);
  const paragraphs = body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
  for (const paragraph of paragraphs) {
    const text = cleanTextFromHtml(paragraph);
    if (countWords(text) >= 8) return text;
  }
  return '';
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  let baseHost = null;

  try {
    baseHost = new URL(baseUrl).host;
  } catch {}

  while ((match = re.exec(html))) {
    const attrs = `${match[1] || ''} ${match[3] || ''}`;
    const rawHref = match[2].trim();
    if (!rawHref || /^#|^javascript:|^mailto:|^tel:/i.test(rawHref)) continue;

    let href = rawHref;
    let isInternal = false;
    let isValidUrl = true;
    try {
      const resolved = new URL(rawHref, baseUrl);
      href = resolved.toString();
      isInternal = baseHost ? resolved.host === baseHost : false;
    } catch {
      isValidUrl = false;
    }

    const innerHtml = match[4] || '';
    const imageMatch = innerHtml.match(/<img\b[^>]*>/i);
    const imageAlt = imageMatch ? readAttribute(imageMatch[0], 'alt') || '' : '';
    const anchorText = cleanTextFromHtml(innerHtml);
    const rel = readAttribute(attrs, 'rel') || '';
    const target = readAttribute(attrs, 'target') || '';
    const ariaLabel = readAttribute(attrs, 'aria-label') || '';
    const wrapsImage = Boolean(imageMatch);
    const cardTitle = extractNearbyCardTitle(html, match.index);
    const placement = detectLinkPlacement({
      html,
      index: match.index,
      attrs,
      innerHtml,
      href,
      anchorText,
      imageAlt,
      wrapsImage,
      cardTitle,
    });

    links.push({
      index: links.length,
      anchorText,
      accessibleText: anchorText || imageAlt,
      href,
      rawHref,
      isInternal,
      isValidUrl,
      rel,
      target,
      ariaLabel,
      doFollow: !/\bnofollow\b/i.test(rel),
      wrapsImage,
      imageAlt,
      placement,
      cardTitle,
      context: extractContextSnippet(html, match.index, re.lastIndex),
    });
  }

  return links;
}

async function fetchLinkStatus(href) {
  const commonOptions = {
    timeout: 5000,
    redirect: 'manual',
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' },
  };

  try {
    let res = await fetch(href, { ...commonOptions, method: 'HEAD' });

    if (res.status === 405 || res.status === 403) {
      res = await fetch(href, { ...commonOptions, method: 'GET' });
    }

    const location = res.headers.get('location');
    let finalHref = href;

    if (location) {
      try {
        finalHref = new URL(location, href).toString();
      } catch {}
    }

    return {
      statusCode: res.status,
      redirected: res.status >= 300 && res.status < 400,
      finalHref,
      statusError: null,
    };
  } catch (error) {
    return {
      statusCode: null,
      redirected: false,
      finalHref: href,
      statusError: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    };
  }
}

async function annotateLinkStatuses(links) {
  const maxChecks = parseInt(process.env.QA_LINK_STATUS_MAX_CHECKS || '80', 10);
  const uniqueHrefs = Array.from(
    new Set(
      links
        .filter((link) => link.isValidUrl && /^https?:\/\//i.test(link.href))
        .map((link) => link.href),
    ),
  ).slice(0, Number.isFinite(maxChecks) && maxChecks > 0 ? maxChecks : 80);
  const statusByHref = new Map();
  const batchSize = 5;

  for (let index = 0; index < uniqueHrefs.length; index += batchSize) {
    const batch = uniqueHrefs.slice(index, index + batchSize);
    const results = await Promise.all(batch.map((href) => fetchLinkStatus(href)));

    batch.forEach((href, resultIndex) => {
      statusByHref.set(href, results[resultIndex]);
    });
  }

  return links.map((link) => {
    const status = statusByHref.get(link.href);

    if (!status) {
      return {
        ...link,
        statusCode: link.isValidUrl ? null : null,
        statusError: link.isValidUrl ? 'Not checked' : 'Invalid URL',
        redirected: false,
        finalHref: link.href,
      };
    }

    return {
      ...link,
      ...status,
    };
  });
}

const SEO_LINK_PLACEMENT_PRIORITY = [
  'main_content',
  'article_content',
  'in_content_cta',
  'card_cta',
  'cta_button',
  'hero_section',
  'related_content',
  'breadcrumb',
  'main_navigation',
  'sidebar',
  'footer',
  'social_links',
  'logo_link',
];

const CONTEXTUAL_LINK_PLACEMENTS = new Set([
  'main_content',
  'article_content',
  'in_content_cta',
  'card_cta',
]);

const ANCHOR_QUALITY_PLACEMENTS = new Set([
  'main_content',
  'article_content',
  'in_content_cta',
]);

const STRUCTURAL_ANCHOR_PLACEMENTS = new Set([
  'header',
  'main_navigation',
  'footer',
  'breadcrumb',
  'pagination',
  'social_links',
  'logo_link',
]);

function normalizeLinkHref(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return String(value || '').replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

function getPlacementPriority(placement) {
  const index = SEO_LINK_PLACEMENT_PRIORITY.indexOf(placement);
  return index === -1 ? SEO_LINK_PLACEMENT_PRIORITY.length : index;
}

function scoreLinkForDeduplication(link) {
  let score = 0;
  const text = link.accessibleText || link.anchorText || '';

  if (text.trim()) score += 20;
  if (text.trim().length >= 5) score += 10;
  if (typeof link.statusCode === 'number' && link.statusCode >= 200 && link.statusCode < 300) score += 8;
  if (typeof link.statusCode === 'number' && link.statusCode >= 400) score -= 12;
  if (link.statusError && link.statusError !== 'Not checked') score -= 8;
  if (link.doFollow) score += 3;
  score -= getPlacementPriority(link.placement || 'main_content');

  return score;
}

function chooseBestLink(links) {
  return [...links].sort((a, b) => {
    const scoreDifference = scoreLinkForDeduplication(b) - scoreLinkForDeduplication(a);
    if (scoreDifference !== 0) return scoreDifference;
    return (a.index ?? 0) - (b.index ?? 0);
  })[0];
}

function buildSeoLinks(links) {
  const byHref = new Map();

  links.forEach((link) => {
    const hrefKey = normalizeLinkHref(link.href);
    if (!hrefKey) return;

    const byPlacement = byHref.get(hrefKey) || new Map();
    const placement = link.placement || 'main_content';
    byPlacement.set(placement, [...(byPlacement.get(placement) || []), link]);
    byHref.set(hrefKey, byPlacement);
  });

  const deduped = [];

  byHref.forEach((byPlacement) => {
    const placements = Array.from(byPlacement.keys());
    const hasContextualPlacement = placements.some((placement) =>
      CONTEXTUAL_LINK_PLACEMENTS.has(placement),
    );
    const eligiblePlacements = hasContextualPlacement
      ? placements.filter((placement) => CONTEXTUAL_LINK_PLACEMENTS.has(placement))
      : placements;

    eligiblePlacements.forEach((placement) => {
      const linksForPlacement = byPlacement.get(placement) || [];
      const bestLink = chooseBestLink(linksForPlacement);

      if (bestLink) {
        deduped.push({
          ...bestLink,
          rawDuplicateCount: linksForPlacement.length,
          seoDeduped: true,
        });
      }
    });
  });

  return deduped.sort((a, b) => {
    const priorityDifference =
      getPlacementPriority(a.placement || 'main_content') -
      getPlacementPriority(b.placement || 'main_content');

    if (priorityDifference !== 0) return priorityDifference;

    return (a.index ?? 0) - (b.index ?? 0);
  });
}

function hasNoindex(html) {
  const robots =
    extractMeta(html, 'robots') ||
    extractMeta(html, 'googlebot') ||
    extractMeta(html, 'bingbot');
  return /(^|,|\s)noindex(,|\s|$)/i.test(robots || '');
}

function detectSchemaTypes(html) {
  const types = new Set();
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  scripts.forEach((script) => {
    const text = cleanTextFromHtml(script);
    const matches = text.match(/"@type"\s*:\s*"?([A-Za-z]+)"?/g) || [];
    matches.forEach((entry) => {
      const match = entry.match(/"@type"\s*:\s*"?([A-Za-z]+)"?/);
      if (match?.[1]) types.add(match[1]);
    });
  });

  return Array.from(types);
}

function hasMixedContent(html) {
  return /<(script|img|link|iframe|source)\b[^>]+(?:src|href)=["']http:\/\//i.test(html);
}

function duplicateParagraphCount(html) {
  const paragraphs = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const counts = new Map();
  let duplicates = 0;

  paragraphs.forEach((paragraph) => {
    const text = normalizeText(cleanTextFromHtml(paragraph));
    if (countWords(text) < 10) return;
    const currentCount = counts.get(text) || 0;
    if (currentCount === 1) duplicates += 1;
    counts.set(text, currentCount + 1);
  });

  return duplicates;
}

function readAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1].trim()) : null;
}

function hasPlacementHint(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function extractNearbyCardTitle(html, index) {
  const before = String(html || '').slice(Math.max(0, index - 1800), index);
  const cardishContext = before.slice(-900).toLowerCase();

  if (!hasPlacementHint(cardishContext, [/card|grid|listing|loop|post-item|service|treatment|doctor|product|archive|tile/])) {
    return null;
  }

  const headingMatches = Array.from(before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi));
  const heading = headingMatches.length ? cleanTextFromHtml(headingMatches[headingMatches.length - 1][0]) : '';

  if (heading && heading.length <= 120) return heading;

  const titleMatches = Array.from(
    before.matchAll(/<[^>]+class=["'][^"']*(?:title|heading|name|card-title|entry-title)[^"']*["'][^>]*>([\s\S]{1,300}?)<\/[^>]+>/gi),
  );
  const title = titleMatches.length ? cleanTextFromHtml(titleMatches[titleMatches.length - 1][0]) : '';

  return title && title.length <= 120 ? title : null;
}

function detectLinkPlacement({ html, index, attrs, innerHtml, href, anchorText, imageAlt, wrapsImage, cardTitle }) {
  const before = html.slice(0, index);
  const after = html.slice(index);
  const lowerBefore = before.toLowerCase();
  const lowerAfter = after.toLowerCase();
  const contextBefore = before.slice(Math.max(0, before.length - 1500));
  const context = `${contextBefore} ${attrs || ''} ${innerHtml || ''}`.toLowerCase();
  const normalizedText = normalizeText(`${anchorText || ''} ${imageAlt || ''}`);
  const normalizedHref = String(href || '').toLowerCase();
  const isGenericCardCta =
    /^(read more|learn more|view more|more)$/i.test(normalizeText(anchorText || imageAlt || '')) &&
    hasPlacementHint(context, [/card|grid|listing|loop|post-item|service|treatment|doctor|product|archive|tile/]);
  const isInside = (tag) => {
    const openIndex = lowerBefore.lastIndexOf(`<${tag}`);
    const closeIndex = lowerBefore.lastIndexOf(`</${tag}>`);
    const nextCloseIndex = lowerAfter.indexOf(`</${tag}>`);

    return openIndex > closeIndex && nextCloseIndex !== -1;
  };

  if (
    hasPlacementHint(normalizedHref, [/facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|pinterest/]) ||
    hasPlacementHint(normalizedText, [/facebook|instagram|linkedin|twitter|youtube|tiktok|pinterest/]) ||
    hasPlacementHint(context, [/social|share-links|follow-us|follow us/])
  ) {
    return 'social_links';
  }

  if (
    wrapsImage &&
    (hasPlacementHint(`${normalizedText} ${normalizedHref}`, [/logo|brand|home/]) ||
      hasPlacementHint(context, [/site-logo|custom-logo|navbar-brand|brand-logo|logo/]))
  ) {
    return 'logo_link';
  }

  if (wrapsImage) {
    return 'image_link';
  }

  if (
    hasPlacementHint(context, [/breadcrumb|breadcrumbs|aria-label=["']breadcrumb|rank-math-breadcrumb|yoast-breadcrumb/])
  ) {
    return 'breadcrumb';
  }

  if (
    hasPlacementHint(context, [/table-of-contents|toc|contents-list|ez-toc|lwptoc/])
  ) {
    return 'table_of_contents';
  }

  if (hasPlacementHint(context, [/pagination|page-numbers|nav-links|next page|previous page|pager/])) {
    return 'pagination';
  }

  if (hasPlacementHint(context, [/related-post|related-content|related article|you may also like|similar posts/])) {
    return 'related_content';
  }

  if (hasPlacementHint(context, [/author-box|author bio|byline|post-author|author-section/])) {
    return 'author_section';
  }

  if (hasPlacementHint(context, [/comment-list|comments-area|comment section|wp-comments|respond/])) {
    return 'comment_section';
  }

  if (hasPlacementHint(context, [/modal|popup|dialog|lightbox|offcanvas/])) {
    return 'popup_modal';
  }

  if (hasPlacementHint(context, [/accordion|tabs|tablist|tab-panel|collapse|toggle/])) {
    return 'accordion_tabs';
  }

  if (hasPlacementHint(context, [/faq|frequently asked|schema-faq|rank-math-list-item/])) {
    return 'faq_section';
  }

  if (
    hasPlacementHint(context, [/btn|button|cta|call-to-action|book-now|booking|appointment|schedule|contact-button/]) ||
    hasPlacementHint(normalizedText, [/book|appointment|consultation|schedule|contact|call now|get started|request|enquire|inquire/])
  ) {
    if (isInside('main') || isInside('article')) return 'in_content_cta';
    return 'cta_button';
  }

  if (hasPlacementHint(context, [/hero|banner|masthead|above-the-fold|home-intro/])) {
    return 'hero_section';
  }

  if (isInside('footer')) {
    return 'footer';
  }

  if (isInside('nav') || hasPlacementHint(context, [/main-menu|primary-menu|navigation|navbar|menu-item/])) {
    return 'main_navigation';
  }

  if (isInside('aside') || hasPlacementHint(context, [/sidebar|widget-area|side-nav|secondary/])) {
    return 'sidebar';
  }

  if (isInside('header')) {
    return 'header';
  }

  if (isGenericCardCta) {
    return 'card_cta';
  }

  if (isInside('article')) {
    return 'article_content';
  }

  return 'main_content';
}

function extractContextSnippet(html, startIndex, endIndex) {
  const before = cleanTextFromHtml(html.slice(Math.max(0, startIndex - 180), startIndex));
  const after = cleanTextFromHtml(html.slice(endIndex, Math.min(html.length, endIndex + 180)));
  return `${before} ${after}`.replace(/\s+/g, ' ').trim().slice(0, 280);
}

function extractHeadings(html) {
  const headings = [];
  const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;

  while ((match = re.exec(html))) {
    const level = Number(match[1]);
    const text = cleanTextFromHtml(match[2]);

    counts[`h${level}`] += 1;

    headings.push({
      index: headings.length,
      level,
      startIndex: match.index,
      endIndex: re.lastIndex,
      text,
    });
  }

  return { headings, headingCounts: counts };
}

function createHeadingIssue({
  ruleKey,
  severity = 'medium',
  title,
  recommendation,
  whyItMatters,
  howToFix,
  heading,
}) {
  return {
    ruleKey,
    severity,
    title,
    recommendation,
    whyItMatters,
    howToFix,
    headingIndex: heading ? heading.index : null,
    headingLevel: heading ? heading.level : null,
    headingText: heading ? heading.text : null,
  };
}

function createOnPageIssue({
  ruleKey,
  severity = 'warning',
  title,
  recommendation,
  whyItMatters,
  howToFix,
  rowKey,
}) {
  return {
    ruleKey,
    severity,
    title,
    recommendation,
    whyItMatters,
    howToFix,
    rowKey: rowKey || null,
  };
}

function createAnchorIssue({
  ruleKey,
  severity = 'suggestion',
  title,
  recommendation,
  whyItMatters,
  howToFix,
  anchor,
  anchorIndex,
  href,
}) {
  return {
    ruleKey,
    severity,
    title,
    recommendation,
    whyItMatters,
    howToFix,
    anchorIndex: typeof anchorIndex === 'number' ? anchorIndex : anchor?.index ?? null,
    anchorText: anchor?.accessibleText || anchor?.anchorText || null,
    href: href || anchor?.href || null,
    placement: anchor?.placement || null,
  };
}

function isGenericAnchor(value) {
  const text = normalizeText(value);
  return new Set([
    'click here',
    'read more',
    'learn more',
    'more',
    'view',
    'visit here',
    'here',
    'this',
    'page',
  ]).has(text);
}

function looksSponsoredLink(link) {
  return /affiliate|ref=|utm_medium=affiliate|sponsor|partner|promo/i.test(link.href);
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

function isAnchorQualityLink(link) {
  return ANCHOR_QUALITY_PLACEMENTS.has(link.placement || 'main_content');
}

function isStructuralAnchorLink(link) {
  return STRUCTURAL_ANCHOR_PLACEMENTS.has(link.placement || 'main_content');
}

function hasUsefulCardContext(link) {
  return link.placement === 'card_cta' && Boolean(String(link.cardTitle || '').trim());
}

function hasCardAriaLabel(link) {
  const ariaLabel = normalizeText(link.ariaLabel);
  const cardTitle = normalizeText(link.cardTitle);

  return Boolean(ariaLabel && (!cardTitle || ariaLabel.includes(cardTitle)));
}

function analyzeAnchorIssues({ links, wordCount }) {
  const issues = [];
  const addIssue = (issue) => issues.push(createAnchorIssue(issue));
  const qualityLinks = links.filter((link) => isAnchorQualityLink(link));
  const internalLinks = qualityLinks.filter((link) => link.isInternal);
  const externalLinks = qualityLinks.filter((link) => !link.isInternal);
  const byAnchorText = new Map();
  const byHref = new Map();

  links.forEach((link) => {
    const isQualityLink = isAnchorQualityLink(link);
    const isStructuralLink = isStructuralAnchorLink(link);
    const isCardCtaWithContext = hasUsefulCardContext(link);
    const textKey = normalizeText(link.accessibleText || link.anchorText);
    const hrefKey = link.href;

    if (isQualityLink) {
      if (textKey) byAnchorText.set(textKey, [...(byAnchorText.get(textKey) || []), link]);
      if (hrefKey) byHref.set(hrefKey, [...(byHref.get(hrefKey) || []), link]);
    }

    if (!link.accessibleText || !link.accessibleText.trim()) {
      addIssue({
        ruleKey: 'EMPTY_ANCHOR_TEXT',
        severity: 'critical',
        title: 'Empty anchor text',
        recommendation: 'Add descriptive anchor text to help users and search engines understand the linked page.',
        whyItMatters: 'Empty links are unclear for screen readers, users, and crawlers.',
        howToFix: 'Add concise text that describes the destination page.',
        anchor: link,
      });
    }

    if (link.placement === 'card_cta' && isGenericAnchor(link.accessibleText || link.anchorText) && isCardCtaWithContext && !hasCardAriaLabel(link)) {
      addIssue({
        ruleKey: 'CARD_CTA_ARIA_LABEL',
        severity: 'suggestion',
        title: 'Card CTA needs clearer accessible text',
        recommendation: `Add an aria-label such as "Read more about ${link.cardTitle}".`,
        whyItMatters: 'Repeated card buttons can be understandable visually but unclear to screen reader users.',
        howToFix: `Add aria-label="Read more about ${link.cardTitle}" to the link.`,
        anchor: link,
      });
    }

    if (isQualityLink && isGenericAnchor(link.accessibleText || link.anchorText)) {
      addIssue({
        ruleKey: 'GENERIC_ANCHOR_TEXT',
        severity: 'warning',
        title: 'Generic anchor text',
        recommendation: 'Replace generic anchor text with descriptive wording related to the destination page topic.',
        whyItMatters: 'Generic anchors do not explain what the user or crawler will find after clicking.',
        howToFix: 'Use topic-specific wording, such as the service, condition, location, or resource name.',
        anchor: link,
      });
    }

    const textLength = (link.accessibleText || link.anchorText || '').trim().length;
    if (isQualityLink && textLength > 0 && textLength <= 4) {
      addIssue({
        ruleKey: 'ANCHOR_TEXT_TOO_SHORT',
        severity: 'suggestion',
        title: 'Anchor text is too short',
        recommendation: 'Use more descriptive anchor text to provide stronger contextual relevance.',
        whyItMatters: 'Very short anchors often lack enough context to describe the destination.',
        howToFix: 'Expand the anchor with the linked page topic or intent.',
        anchor: link,
      });
    }

    if (isQualityLink && textLength > 90) {
      addIssue({
        ruleKey: 'ANCHOR_TEXT_TOO_LONG',
        severity: 'suggestion',
        title: 'Anchor text is too long',
        recommendation: 'Keep anchor text concise and focused for better readability and SEO clarity.',
        whyItMatters: 'Long sentence-style anchors are harder to scan and can look unnatural.',
        howToFix: 'Shorten the anchor to the core destination topic.',
        anchor: link,
      });
    }

    if (!link.isValidUrl) {
      addIssue({
        ruleKey: 'INVALID_ANCHOR_URL',
        severity: 'critical',
        title: 'Invalid anchor URL',
        recommendation: 'Fix invalid URLs to improve crawlability and user experience.',
        whyItMatters: 'Invalid links can break navigation and waste crawl paths.',
        howToFix: 'Replace the href with a valid internal or external URL.',
        anchor: link,
      });
    }

    if (link.statusError && link.statusError !== 'Not checked') {
      addIssue({
        ruleKey: 'LINK_STATUS_CHECK_FAILED',
        severity: 'warning',
        title: 'Link status could not be checked',
        recommendation: 'Review this link manually to confirm it is reachable.',
        whyItMatters: 'Unreachable links can create poor user experience and crawl waste.',
        howToFix: 'Open the destination and update or remove the link if it is not available.',
        anchor: link,
      });
    }

    if (typeof link.statusCode === 'number' && link.statusCode >= 400) {
      addIssue({
        ruleKey: 'BROKEN_ANCHOR_LINK',
        severity: 'critical',
        title: `Broken link returns HTTP ${link.statusCode}`,
        recommendation: 'Fix broken links to improve crawlability and user experience.',
        whyItMatters: 'Broken links frustrate users and waste crawl paths.',
        howToFix: 'Update the URL, redirect the destination, or remove the link.',
        anchor: link,
      });
    }

    if (
      !isStructuralLink &&
      (link.redirected ||
        (typeof link.statusCode === 'number' && link.statusCode >= 300 && link.statusCode < 400))
    ) {
      addIssue({
        ruleKey: 'REDIRECTED_ANCHOR_LINK',
        severity: 'suggestion',
        title: `Link redirects${link.statusCode ? ` with HTTP ${link.statusCode}` : ''}`,
        recommendation: 'Update internal links to point directly to the final destination URL.',
        whyItMatters: 'Direct links reduce crawl friction and improve user speed.',
        howToFix: `Replace the link with ${link.finalHref || 'the final destination URL'}.`,
        anchor: link,
      });
    }

    if (!isStructuralLink && link.isInternal && /\bnofollow\b/i.test(link.rel)) {
      addIssue({
        ruleKey: 'INTERNAL_NOFOLLOW',
        severity: 'warning',
        title: 'Internal link uses nofollow',
        recommendation: 'Avoid using nofollow on important internal links unless intentionally blocking crawl flow.',
        whyItMatters: 'Nofollow can weaken internal link equity and crawl discovery.',
        howToFix: 'Remove nofollow from normal internal links.',
        anchor: link,
      });
    }

    if (!isStructuralLink && !link.isInternal && link.target === '_blank' && !/\bnoopener\b/i.test(link.rel)) {
      addIssue({
        ruleKey: 'UNSAFE_EXTERNAL_TARGET_BLANK',
        severity: 'suggestion',
        title: 'External link opens in a new tab without noopener',
        recommendation: 'Add proper security attributes to external links opening in new tabs.',
        whyItMatters: 'noopener helps prevent the linked page from controlling the opener tab.',
        howToFix: 'Add rel="noopener noreferrer" to external target blank links.',
        anchor: link,
      });
    }

    if (!isStructuralLink && !link.isInternal && looksSponsoredLink(link) && !/\b(sponsored|ugc)\b/i.test(link.rel)) {
      addIssue({
        ruleKey: 'SPONSORED_REL_MISSING',
        severity: 'suggestion',
        title: 'Sponsored/affiliate link may need rel attributes',
        recommendation: 'Add appropriate rel attributes to sponsored or user-generated links.',
        whyItMatters: 'Sponsored and UGC attributes help search engines classify paid or user-generated links.',
        howToFix: 'Use rel="sponsored" for paid/affiliate links or rel="ugc" for user-generated links.',
        anchor: link,
      });
    }

    if (link.wrapsImage && !link.imageAlt.trim()) {
      addIssue({
        ruleKey: 'IMAGE_LINK_MISSING_ALT',
        severity: 'warning',
        title: 'Image link is missing alt text',
        recommendation: 'Add descriptive alt text to linked images to improve accessibility and SEO signals.',
        whyItMatters: 'Image links need alt text to provide accessible anchor context.',
        howToFix: 'Add alt text describing the linked destination or image purpose.',
        anchor: link,
      });
    }

    if (isQualityLink && keywordRepeatCount(link.accessibleText || link.anchorText) >= 2 && textLength > 35) {
      addIssue({
        ruleKey: 'KEYWORD_STUFFED_ANCHOR',
        severity: 'critical',
        title: 'Keyword-stuffed anchor text',
        recommendation: 'Avoid keyword stuffing and write anchor text naturally for users.',
        whyItMatters: 'Overloaded anchor text can look spammy and reduce readability.',
        howToFix: 'Use a concise, natural phrase that describes the destination once.',
        anchor: link,
      });
    }
  });

  byAnchorText.forEach((matches) => {
    const uniqueHrefs = new Set(matches.map((link) => link.href));
    if (uniqueHrefs.size > 1) {
      matches.forEach((link) => {
        addIssue({
          ruleKey: 'SAME_ANCHOR_DIFFERENT_PAGES',
          severity: 'warning',
          title: 'Same anchor text links to different pages',
          recommendation: 'Avoid using identical anchor text for different destination pages to reduce ambiguity.',
          whyItMatters: 'The same anchor text should usually point to the same topic.',
          howToFix: 'Rewrite anchors so each destination has distinct, descriptive wording.',
          anchor: link,
        });
      });
    }

    if (matches.length >= 8) {
      matches.forEach((link) => {
        addIssue({
          ruleKey: 'REPETITIVE_ANCHOR_PATTERN',
          severity: 'warning',
          title: 'Repetitive anchor pattern',
          recommendation: 'Diversify anchor text naturally using semantic variations.',
          whyItMatters: 'Repeated exact anchors can look over-optimized and less natural.',
          howToFix: 'Use natural variants that still describe the destination accurately.',
          anchor: link,
        });
      });
    }
  });

  byHref.forEach((matches) => {
    const uniqueTexts = new Set(
      matches
        .map((link) => normalizeText(link.accessibleText || link.anchorText))
        .filter(Boolean),
    );

    if (uniqueTexts.size >= 6) {
      matches.forEach((link) => {
        addIssue({
          ruleKey: 'MANY_ANCHORS_SAME_PAGE',
          severity: 'suggestion',
          title: 'Many anchor variants point to the same page',
          recommendation: 'Maintain consistent topical relevance in anchor text pointing to the same page.',
          whyItMatters: 'Too many unrelated anchors for one destination can weaken topical clarity.',
          howToFix: 'Use related semantic variants, not unrelated phrases.',
          anchor: link,
        });
      });
    }
  });

  if (wordCount >= 700 && internalLinks.length < 3) {
    issues.push(createAnchorIssue({
      ruleKey: 'LOW_INTERNAL_LINK_COUNT',
      severity: 'suggestion',
      title: 'Low internal link count',
      recommendation: 'Add more relevant internal links throughout the content.',
      whyItMatters: 'Long-form content should connect users and crawlers to related pages.',
      howToFix: 'Add contextual internal links to related services, conditions, FAQs, or conversion pages.',
    }));
  }

  if (internalLinks.length > Math.max(60, Math.ceil(wordCount / 10))) {
    issues.push(createAnchorIssue({
      ruleKey: 'EXCESSIVE_INTERNAL_LINKS',
      severity: 'warning',
      title: 'Excessive internal links',
      recommendation: 'Reduce excessive links to improve usability and preserve link equity.',
      whyItMatters: 'Too many links can overwhelm users and dilute contextual importance.',
      howToFix: 'Keep the most useful navigation and contextual links.',
    }));
  }

  if (externalLinks.length > 20) {
    issues.push(createAnchorIssue({
      ruleKey: 'EXTERNAL_LINK_SPAM',
      severity: 'warning',
      title: 'Too many outbound external links',
      recommendation: 'Limit excessive outbound links and prioritize high-authority sources.',
      whyItMatters: 'Excessive outbound links can distract users and reduce conversion focus.',
      howToFix: 'Keep only external links that support the page content.',
    }));
  }

  if (wordCount < 250 && qualityLinks.length > 20) {
    issues.push(createAnchorIssue({
      ruleKey: 'THIN_CONTENT_EXCESSIVE_LINKS',
      severity: 'warning',
      title: 'Thin content with excessive links',
      recommendation: 'Increase content depth and reduce excessive linking.',
      whyItMatters: 'Pages with little content and many links can feel low quality.',
      howToFix: 'Add useful copy and remove unnecessary links.',
    }));
  }

  return issues;
}

function analyzeOnPageIssues({
  url,
  finalUrl,
  html,
  title,
  metaDescription,
  firstH1,
  h1Count,
  headings,
  headingIssues,
  canonical,
  schemaJsonLd,
  schemaTypes,
  viewport,
  lang,
  focusKeyword,
  links,
  noindex,
  hasPhoneClickable,
  hasEmailClickable,
  hasBookingLink,
  hasTestimonials,
  hasStarRating,
  hasGoogleReviews,
  hasMedicalSchema,
  hasLocalBusinessSchema,
  hasFaqSchema,
  status,
}) {
  const issues = [];
  const addIssue = (issue) => issues.push(createOnPageIssue(issue));
  const pageUrl = finalUrl || url;
  const parsedUrl = (() => {
    try { return new URL(pageUrl); } catch { return null; }
  })();
  const path = parsedUrl?.pathname || '';
  const slugText = path.split('/').filter(Boolean).join(' ');
  const pageText = stripHtmlToText(html);
  const wordCount = countWords(pageText);
  const firstParagraph = extractFirstParagraphText(html);
  const duplicateParagraphs = duplicateParagraphCount(html);
  const internalLinks = links.filter((link) => link.isInternal);
  const externalLinks = links.filter((link) => !link.isInternal);
  const ogTitle = extractMeta(html, 'og:title');
  const ogDescription = extractMeta(html, 'og:description');
  const ogImage = extractMeta(html, 'og:image');
  const twitterCard = extractMeta(html, 'twitter:card');
  const twitterTitle = extractMeta(html, 'twitter:title');
  const hasBreadcrumbSchema = schemaTypes.includes('BreadcrumbList');
  const focus = focusKeyword || '';

  if (typeof status === 'number' && status !== 200) {
    addIssue({
      ruleKey: 'HTTP_STATUS_NOT_200',
      severity: 'critical',
      title: `HTTP status is ${status}`,
      recommendation: 'Serve the page with a clean HTTP 200 response when it should be indexable.',
      whyItMatters: 'Search engines and users may treat non-200 pages as unavailable or unstable.',
      howToFix: 'Check redirects, server errors, deleted pages, and WordPress permalink settings.',
      rowKey: 'page-url',
    });
  }

  if (parsedUrl?.protocol !== 'https:') {
    addIssue({
      ruleKey: 'HTTPS_NOT_ENABLED',
      severity: 'critical',
      title: 'HTTPS is not enabled',
      recommendation: 'Use HTTPS for the page URL.',
      whyItMatters: 'Secure URLs are expected for trust, browser safety, and SEO.',
      howToFix: 'Install/renew SSL and redirect HTTP URLs to HTTPS.',
      rowKey: 'page-url',
    });
  }

  if (path.length > 80 || path.split('/').filter(Boolean).some((segment) => segment.length > 45)) {
    addIssue({
      ruleKey: 'URL_NOT_READABLE',
      severity: 'suggestion',
      title: 'URL could be shorter and more readable',
      recommendation: 'Keep URLs short, descriptive, and easy to read.',
      whyItMatters: 'Readable URLs help users and search engines understand page context.',
      howToFix: 'Use concise slugs that describe the service, condition, location, or topic.',
      rowKey: 'page-url',
    });
  }

  if (/_/.test(path)) {
    addIssue({
      ruleKey: 'URL_UNDERSCORES',
      severity: 'warning',
      title: 'URL uses underscores',
      recommendation: 'Use hyphens instead of underscores in URLs.',
      whyItMatters: 'Hyphens are clearer word separators for users and search engines.',
      howToFix: 'Update the slug to use hyphens and add a redirect from the old URL.',
      rowKey: 'page-url',
    });
  }

  if (parsedUrl?.search) {
    addIssue({
      ruleKey: 'URL_PARAMETERS',
      severity: 'warning',
      title: 'URL contains query parameters',
      recommendation: 'Avoid unnecessary URL parameters on canonical indexable pages.',
      whyItMatters: 'Parameters can create duplicate URL variations and dilute signals.',
      howToFix: 'Use a clean canonical URL without tracking/query parameters.',
      rowKey: 'page-url',
    });
  }

  if (focus && slugText && !includesNormalized(slugText, focus)) {
    addIssue({
      ruleKey: 'KEYWORD_MISSING_FROM_URL',
      severity: 'suggestion',
      title: 'Primary keyword is missing from URL',
      recommendation: 'Include the primary keyword in the URL when it fits naturally.',
      whyItMatters: 'A relevant slug reinforces page topic and improves scanability in search results.',
      howToFix: `Consider a concise slug containing "${focus}" if it reflects the real page topic.`,
      rowKey: 'page-url',
    });
  }

  if (!canonical) {
    addIssue({
      ruleKey: 'MISSING_CANONICAL',
      severity: 'critical',
      title: 'Canonical URL is missing',
      recommendation: 'Add a canonical tag that points to the preferred page URL.',
      whyItMatters: 'Missing canonicals can cause duplicate URL variations to compete.',
      howToFix: 'Use your SEO plugin or page head template to add a canonical URL.',
      rowKey: 'canonical',
    });
  } else if (canonical && parsedUrl) {
    try {
      const canonicalUrl = new URL(canonical, pageUrl);
      if (canonicalUrl.host !== parsedUrl.host) {
        addIssue({
          ruleKey: 'CANONICAL_HOST_MISMATCH',
          severity: 'critical',
          title: 'Canonical points to a different domain',
          recommendation: 'Make sure the canonical URL points to the preferred URL on the correct site.',
          whyItMatters: 'A wrong canonical can tell Google to index another domain or page instead.',
          howToFix: 'Update the canonical URL in the SEO plugin or page template.',
          rowKey: 'canonical',
        });
      }
    } catch {}
  }

  if (!title) {
    addIssue({
      ruleKey: 'MISSING_TITLE',
      severity: 'critical',
      title: 'Missing title tag',
      recommendation: 'Add a unique title tag for this page.',
      whyItMatters: 'The title tag is one of the strongest on-page SEO and CTR signals.',
      howToFix: 'Add a 50-60 character SEO title with the primary keyword near the beginning.',
      rowKey: 'meta-title',
    });
  } else {
    if (title.length < 50 || title.length > 60) {
      addIssue({
        ruleKey: 'TITLE_LENGTH',
        severity: 'warning',
        title: 'Title length is not optimal',
        recommendation: 'Keep title tags around 50-60 characters.',
        whyItMatters: 'Titles that are too short miss context; long titles can be truncated in search results.',
        howToFix: 'Rewrite the title to lead with the primary topic and include a concise brand/location modifier.',
        rowKey: 'meta-title',
      });
    }

    if (focus && !includesNormalized(title, focus)) {
      addIssue({
        ruleKey: 'KEYWORD_MISSING_FROM_TITLE',
        severity: 'warning',
        title: 'Primary keyword is missing from title',
        recommendation: 'Place the primary keyword near the beginning of the title tag.',
        whyItMatters: 'The title should strongly reinforce the search topic.',
        howToFix: `Rewrite the title so "${focus}" appears naturally near the start.`,
        rowKey: 'meta-title',
      });
    }

    if (focus && normalizeText(title).split(normalizeText(focus)).length - 1 > 1) {
      addIssue({
        ruleKey: 'TITLE_KEYWORD_STUFFING',
        severity: 'warning',
        title: 'Keyword appears too often in title',
        recommendation: 'Avoid keyword stuffing in title tags.',
        whyItMatters: 'Repetitive titles look spammy and reduce click appeal.',
        howToFix: 'Use the primary keyword once and add a benefit, location, or brand modifier.',
        rowKey: 'meta-title',
      });
    }
  }

  if (!metaDescription) {
    addIssue({
      ruleKey: 'MISSING_META_DESCRIPTION',
      severity: 'warning',
      title: 'Missing meta description',
      recommendation: 'Add a unique meta description for this page.',
      whyItMatters: 'Google may auto-generate a weak snippet if no description exists.',
      howToFix: 'Write 140-160 characters with the keyword, benefit, and CTA where relevant.',
      rowKey: 'meta-description',
    });
  } else {
    if (metaDescription.length < 140 || metaDescription.length > 160) {
      addIssue({
        ruleKey: 'META_DESCRIPTION_LENGTH',
        severity: 'suggestion',
        title: 'Meta description length is not optimal',
        recommendation: 'Keep meta descriptions around 140-160 characters.',
        whyItMatters: 'A well-sized snippet improves clarity and click-through rate.',
        howToFix: 'Trim or expand the description while keeping the CTA and main benefit visible.',
        rowKey: 'meta-description',
      });
    }

    if (focus && !includesNormalized(metaDescription, focus)) {
      addIssue({
        ruleKey: 'KEYWORD_MISSING_FROM_META_DESCRIPTION',
        severity: 'suggestion',
        title: 'Primary keyword is missing from meta description',
        recommendation: 'Include the primary keyword naturally in the meta description.',
        whyItMatters: 'Relevant snippets can improve search-result confidence and CTR.',
        howToFix: `Mention "${focus}" naturally while keeping the description user-focused.`,
        rowKey: 'meta-description',
      });
    }
  }

  if (h1Count === 0) {
    addIssue({
      ruleKey: 'MISSING_H1',
      severity: 'critical',
      title: 'Missing H1',
      recommendation: 'Add exactly one H1 that clearly describes the page topic.',
      whyItMatters: 'The H1 is the main semantic heading for crawlers and assistive technology.',
      howToFix: 'Add one H1 near the top of the content.',
      rowKey: 'h1',
    });
  } else if (h1Count > 1) {
    addIssue({
      ruleKey: 'MULTIPLE_H1',
      severity: 'warning',
      title: 'Multiple H1 headings',
      recommendation: 'Keep exactly one H1 and demote secondary H1s.',
      whyItMatters: 'Multiple H1s make the primary page topic less clear.',
      howToFix: 'Change secondary H1s to H2 or H3 as appropriate.',
      rowKey: 'h1',
    });
  }

  if (focus && firstH1 && !includesNormalized(firstH1, focus)) {
    addIssue({
      ruleKey: 'KEYWORD_MISSING_FROM_H1',
      severity: 'warning',
      title: 'Primary keyword is missing from H1',
      recommendation: 'Include the primary keyword naturally in the H1.',
      whyItMatters: 'The H1 should reinforce the main page topic.',
      howToFix: `Add "${focus}" to the H1 only if it reads naturally and matches intent.`,
      rowKey: 'h1',
    });
  }

  if (title && firstH1 && normalizeText(title) === normalizeText(firstH1)) {
    addIssue({
      ruleKey: 'H1_EQUALS_TITLE',
      severity: 'suggestion',
      title: 'H1 is identical to the title tag',
      recommendation: 'Make the H1 differ slightly from the title tag.',
      whyItMatters: 'A slightly different H1 can improve natural language relevance without duplication.',
      howToFix: 'Keep the same topic, but make the H1 more user-facing and less search-snippet focused.',
      rowKey: 'h1',
    });
  }

  if (headingIssues.length) {
    addIssue({
      ruleKey: 'HEADING_STRUCTURE_ISSUES',
      severity: headingIssues.some((issue) => issue.severity === 'high') ? 'warning' : 'suggestion',
      title: 'Heading structure needs improvement',
      recommendation: 'Fix the heading hierarchy issues shown in the Header Structure tab.',
      whyItMatters: 'Clear headings improve accessibility, crawlability, and readability.',
      howToFix: 'Review the Header Structure recommendations and adjust H1-H6 levels/content.',
      rowKey: 'headings',
    });
  }

  if (wordCount < 250) {
    addIssue({
      ruleKey: 'THIN_CONTENT',
      severity: 'warning',
      title: 'Page content appears thin',
      recommendation: 'Add enough original, useful content to satisfy the page intent.',
      whyItMatters: 'Thin pages often struggle to rank and may not answer user questions.',
      howToFix: 'Expand the page with service details, benefits, FAQs, process, trust signals, and clear CTAs.',
      rowKey: 'content',
    });
  }

  if (duplicateParagraphs > 0) {
    addIssue({
      ruleKey: 'DUPLICATE_PARAGRAPHS',
      severity: 'warning',
      title: 'Duplicate paragraph content detected',
      recommendation: 'Remove or rewrite repeated paragraphs.',
      whyItMatters: 'Duplicate body copy weakens originality and readability.',
      howToFix: 'Keep one version of repeated copy and make each section unique.',
      rowKey: 'content',
    });
  }

  if (focus && firstParagraph && !includesNormalized(firstParagraph, focus)) {
    addIssue({
      ruleKey: 'KEYWORD_MISSING_FROM_FIRST_PARAGRAPH',
      severity: 'suggestion',
      title: 'Primary keyword is missing from first paragraph',
      recommendation: 'Mention the primary keyword naturally early in the content.',
      whyItMatters: 'Early topical signals help users and search engines confirm relevance.',
      howToFix: `Add "${focus}" or a close natural variant in the opening paragraph.`,
      rowKey: 'content',
    });
  }

  if (focus && normalizeText(pageText).split(normalizeText(focus)).length - 1 > Math.max(5, Math.ceil(wordCount / 120))) {
    addIssue({
      ruleKey: 'BODY_KEYWORD_STUFFING',
      severity: 'warning',
      title: 'Primary keyword may be overused',
      recommendation: 'Keep keyword usage natural and use semantic variations.',
      whyItMatters: 'Overusing exact-match keywords hurts readability and can look manipulative.',
      howToFix: 'Replace repeated exact-match phrases with related terms, entities, and natural wording.',
      rowKey: 'content',
    });
  }

  if (internalLinks.length === 0) {
    addIssue({
      ruleKey: 'NO_INTERNAL_LINKS',
      severity: 'warning',
      title: 'No internal links detected',
      recommendation: 'Add relevant internal links to related important pages.',
      whyItMatters: 'Internal links help users navigate and help search engines understand site structure.',
      howToFix: 'Add contextual links to related services, conditions, contact, booking, or supporting content.',
      rowKey: 'internal-links',
    });
  }

  if (internalLinks.length > 60) {
    addIssue({
      ruleKey: 'EXCESSIVE_INTERNAL_LINKS',
      severity: 'suggestion',
      title: 'Internal links may be excessive',
      recommendation: 'Keep internal links useful and contextually relevant.',
      whyItMatters: 'Too many links can dilute attention and make the page harder to use.',
      howToFix: 'Prioritize the most relevant contextual links and navigation links.',
      rowKey: 'internal-links',
    });
  }

  if (externalLinks.length > 20) {
    addIssue({
      ruleKey: 'EXCESSIVE_EXTERNAL_LINKS',
      severity: 'suggestion',
      title: 'Many outbound links detected',
      recommendation: 'Avoid excessive outbound links unless they support the page intent.',
      whyItMatters: 'Too many external links can distract users from conversion paths.',
      howToFix: 'Keep authoritative citations, but remove unnecessary outbound links.',
      rowKey: 'external-links',
    });
  }

  if (!viewport) {
    addIssue({
      ruleKey: 'MISSING_VIEWPORT',
      severity: 'critical',
      title: 'Mobile viewport tag missing',
      recommendation: 'Add a viewport meta tag for mobile-friendly rendering.',
      whyItMatters: 'Pages without viewport metadata can render poorly on mobile devices.',
      howToFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
      rowKey: 'technical',
    });
  }

  if (noindex) {
    addIssue({
      ruleKey: 'NOINDEX_DETECTED',
      severity: 'critical',
      title: 'Page is marked noindex',
      recommendation: 'Remove noindex if this page should appear in Google.',
      whyItMatters: 'Noindex tells search engines not to include the page in search results.',
      howToFix: 'Check SEO plugin index settings and robots meta tags.',
      rowKey: 'technical',
    });
  }

  if (!lang) {
    addIssue({
      ruleKey: 'MISSING_HTML_LANG',
      severity: 'suggestion',
      title: 'HTML language attribute missing',
      recommendation: 'Add the correct lang attribute to the HTML tag.',
      whyItMatters: 'Language metadata supports accessibility and international targeting.',
      howToFix: 'Set the site/page language in WordPress or add language_attributes() to the theme.',
      rowKey: 'technical',
    });
  }

  if (hasMixedContent(html)) {
    addIssue({
      ruleKey: 'MIXED_CONTENT',
      severity: 'critical',
      title: 'Mixed content detected',
      recommendation: 'Load assets over HTTPS.',
      whyItMatters: 'Mixed content can trigger browser security warnings and break assets.',
      howToFix: 'Replace http:// asset URLs with https:// versions.',
      rowKey: 'technical',
    });
  }

  if (!schemaJsonLd) {
    addIssue({
      ruleKey: 'MISSING_SCHEMA',
      severity: 'warning',
      title: 'Structured data is missing',
      recommendation: 'Add valid JSON-LD schema for the page type.',
      whyItMatters: 'Schema helps search engines understand entities and can support rich results.',
      howToFix: 'Add Organization, LocalBusiness/MedicalClinic, Breadcrumb, FAQ, Article, or Review schema where relevant.',
      rowKey: 'schema',
    });
  } else if (!hasMedicalSchema && !hasLocalBusinessSchema && !hasFaqSchema && !hasBreadcrumbSchema) {
    addIssue({
      ruleKey: 'WEAK_SCHEMA_TYPES',
      severity: 'suggestion',
      title: 'Schema types may be incomplete',
      recommendation: 'Use schema that matches the page type and business context.',
      whyItMatters: 'Generic or incomplete schema gives search engines less useful entity context.',
      howToFix: 'Add relevant Organization, LocalBusiness/MedicalClinic, Breadcrumb, FAQ, Article, or Review schema.',
      rowKey: 'schema',
    });
  }

  if (!ogTitle || !ogDescription || !ogImage) {
    addIssue({
      ruleKey: 'MISSING_OPEN_GRAPH',
      severity: 'suggestion',
      title: 'Open Graph tags are incomplete',
      recommendation: 'Add Open Graph title, description, and image tags.',
      whyItMatters: 'Open Graph improves how links preview when shared in social and messaging apps.',
      howToFix: 'Configure Open Graph metadata in the SEO plugin or page template.',
      rowKey: 'social-meta',
    });
  }

  if (!twitterCard || !twitterTitle) {
    addIssue({
      ruleKey: 'MISSING_TWITTER_CARD',
      severity: 'suggestion',
      title: 'Twitter/X card tags are incomplete',
      recommendation: 'Add Twitter card metadata.',
      whyItMatters: 'Card metadata improves link previews and sharing consistency.',
      howToFix: 'Configure Twitter card metadata in the SEO plugin.',
      rowKey: 'social-meta',
    });
  }

  if (!hasPhoneClickable && !hasEmailClickable && !hasBookingLink) {
    addIssue({
      ruleKey: 'WEAK_CONVERSION_PATH',
      severity: 'warning',
      title: 'Weak conversion path',
      recommendation: 'Make the main contact or booking action clear and clickable.',
      whyItMatters: 'SEO traffic needs a clear next step to convert into enquiries.',
      howToFix: 'Add a visible booking CTA, clickable phone number, email link, or contact form.',
      rowKey: 'ux-cro',
    });
  }

  if (!hasTestimonials && !hasStarRating && !hasGoogleReviews) {
    addIssue({
      ruleKey: 'MISSING_TRUST_SIGNALS',
      severity: 'suggestion',
      title: 'Trust signals are limited',
      recommendation: 'Add reviews, testimonials, credentials, or social proof where relevant.',
      whyItMatters: 'Trust signals support E-E-A-T and improve conversion confidence.',
      howToFix: 'Add patient testimonials, Google reviews, ratings, credentials, or proof points.',
      rowKey: 'eeat',
    });
  }

  return issues;
}

function analyzeHeadingIssues({ html, headings, headingCounts, focusKeyword }) {
  const issues = [];
  const pageText = stripHtmlToText(html);
  const wordCount = countWords(pageText);
  const nonEmptyHeadings = headings.filter((heading) => heading.text.trim());
  const h1Headings = headings.filter((heading) => heading.level === 1);
  const firstH1 = h1Headings[0] || null;
  const addIssue = (issue) => issues.push(createHeadingIssue(issue));

  if (headingCounts.h1 === 0) {
    addIssue({
      ruleKey: 'MISSING_H1',
      severity: 'high',
      title: 'Missing H1 heading',
      recommendation: 'Add a single, clearly defined H1 representing the primary topic of the page.',
      whyItMatters: 'Search engines and screen readers rely on one primary H1 to understand the page topic.',
      howToFix: 'Add one H1 near the top of the page using the primary topic or service name.',
    });
  } else if (headingCounts.h1 > 1) {
    addIssue({
      ruleKey: 'MULTIPLE_H1',
      severity: 'high',
      title: 'Multiple H1 headings detected',
      recommendation: 'Keep one primary H1 and demote secondary H1 headings to H2.',
      whyItMatters: 'Multiple H1 headings dilute the primary topic signal and can confuse assistive technologies.',
      howToFix: 'Choose the main page title as the only H1. Change the other H1 headings to H2 or H3 based on hierarchy.',
      heading: firstH1,
    });

    h1Headings.slice(1).forEach((heading) => {
      addIssue({
        ruleKey: 'EXTRA_H1',
        severity: 'medium',
        title: 'Secondary H1 should be demoted',
        recommendation: 'Change this secondary H1 to an H2 unless it is the main page topic.',
        whyItMatters: 'Only one H1 should define the page topic.',
        howToFix: 'Change this heading level from H1 to H2 in the page editor.',
        heading,
      });
    });
  }

  if (firstH1 && firstH1.index > 1) {
    addIssue({
      ruleKey: 'H1_TOO_DEEP',
      severity: 'medium',
      title: 'H1 appears too deep in the content structure',
      recommendation: 'Move the H1 closer to the beginning of the page for stronger semantic relevance.',
      whyItMatters: 'A delayed H1 makes the page topic less clear for crawlers, screen readers, and users scanning the page.',
      howToFix: 'Place the H1 before secondary sections and below only essential hero/navigation elements.',
      heading: firstH1,
    });
  }

  for (let index = 1; index < nonEmptyHeadings.length; index += 1) {
    const previous = nonEmptyHeadings[index - 1];
    const current = nonEmptyHeadings[index];

    if (current.level > previous.level + 1) {
      addIssue({
        ruleKey: 'SKIPPED_HEADING_LEVEL',
        severity: 'medium',
        title: `Skipped heading level: H${previous.level} to H${current.level}`,
        recommendation: 'Follow sequential heading order to improve crawlability and accessibility.',
        whyItMatters: 'Skipped levels make the content outline harder to understand for search engines and screen readers.',
        howToFix: `Add an H${previous.level + 1} before this heading or change this H${current.level} to H${previous.level + 1}.`,
        heading: current,
      });
    }
  }

  if (wordCount >= 700 && headingCounts.h2 === 0) {
    addIssue({
      ruleKey: 'LONG_CONTENT_NO_H2',
      severity: 'medium',
      title: 'Long-form page has no H2 headings',
      recommendation: 'Break content into logical sections using descriptive H2 headings.',
      whyItMatters: 'Long pages without H2 sections are harder to scan and give weaker topical structure.',
      howToFix: 'Add H2 headings for the main sections, treatments, conditions, FAQs, or benefits on the page.',
    });
  }

  headings
    .filter((heading) => !heading.text.trim())
    .forEach((heading) => {
      addIssue({
        ruleKey: 'EMPTY_HEADING',
        severity: 'medium',
        title: `Empty H${heading.level} heading`,
        recommendation: 'Remove unused heading tags or provide meaningful text content.',
        whyItMatters: 'Empty headings create confusing stops for screen reader users and weaken the content outline.',
        howToFix: 'Delete the empty heading block or replace it with descriptive section text.',
        heading,
      });
    });

  const headingsByText = new Map();
  nonEmptyHeadings.forEach((heading) => {
    const key = normalizeText(heading.text);
    if (!key) return;
    headingsByText.set(key, [...(headingsByText.get(key) || []), heading]);
  });
  headingsByText.forEach((matches) => {
    if (matches.length < 2) return;
    matches.forEach((heading) => {
      addIssue({
        ruleKey: 'DUPLICATE_HEADING_TEXT',
        severity: 'medium',
        title: 'Duplicate heading text',
        recommendation: 'Use unique headings where possible to improve topical clarity.',
        whyItMatters: 'Repeated heading labels make sections harder to distinguish for users and crawlers.',
        howToFix: 'Make each repeated heading more specific to the section it introduces.',
        heading,
      });
    });
  });

  nonEmptyHeadings.forEach((heading) => {
    const length = heading.text.length;

    if (heading.level === 1 && (length < 20 || length > 70)) {
      addIssue({
        ruleKey: 'H1_LENGTH',
        severity: length > 90 ? 'high' : 'medium',
        title: length < 20 ? 'H1 is too short' : 'H1 is too long',
        recommendation: 'Keep the H1 between 20 and 70 characters.',
        whyItMatters: 'The H1 should be specific enough to define the topic while remaining readable.',
        howToFix: length < 20
          ? 'Expand the H1 with the service, condition, location, or main page topic.'
          : 'Shorten the H1 so it clearly describes the page topic without becoming a sentence.',
        heading,
      });
    }

    if ([2, 3].includes(heading.level) && (length < 8 || length > 90)) {
      addIssue({
        ruleKey: 'SUPPORTING_HEADING_LENGTH',
        severity: 'low',
        title: length < 8 ? `H${heading.level} lacks context` : `H${heading.level} is too long`,
        recommendation: 'Keep supporting headings concise and descriptive.',
        whyItMatters: 'Supporting headings should help users scan the page and understand each section quickly.',
        howToFix: length < 8
          ? 'Expand this heading with clearer topic context.'
          : 'Shorten this heading while keeping the core section topic.',
        heading,
      });
    }
  });

  const totalHeadings = headings.length;
  const excessiveLimit = Math.max(14, Math.ceil(wordCount / 120));
  if (wordCount > 0 && totalHeadings > excessiveLimit) {
    addIssue({
      ruleKey: 'EXCESSIVE_HEADING_USAGE',
      severity: 'low',
      title: 'Too many headings for the amount of content',
      recommendation: 'Reduce unnecessary headings and consolidate related sections.',
      whyItMatters: 'Overusing headings makes the outline noisy and reduces the value of important sections.',
      howToFix: 'Convert decorative or repeated headings to paragraph text and merge related sections.',
    });
  }

  const vagueHeadings = new Set(['more', 'information', 'section', 'content', 'details', 'overview', 'learn more', 'read more']);
  nonEmptyHeadings.forEach((heading) => {
    if (!vagueHeadings.has(normalizeText(heading.text))) return;
    addIssue({
      ruleKey: 'VAGUE_HEADING',
      severity: 'medium',
      title: 'Vague heading text',
      recommendation: 'Replace generic headings with descriptive, search-intent-driven wording.',
      whyItMatters: 'Generic headings do not communicate topic, intent, or relevance.',
      howToFix: 'Rewrite the heading to describe the exact section, condition, treatment, benefit, or question being answered.',
      heading,
    });
  });

  for (let index = 0; index < headings.length - 1; index += 1) {
    const current = headings[index];
    const next = headings[index + 1];
    const betweenText = stripHtmlToText(html.slice(current.endIndex, next.startIndex));

    if (current.text.trim() && countWords(betweenText) < 12) {
      addIssue({
        ruleKey: 'HEADING_WITHOUT_SUPPORTING_CONTENT',
        severity: 'low',
        title: 'Heading has little supporting content',
        recommendation: 'Add relevant supporting copy beneath each heading.',
        whyItMatters: 'Headings should introduce meaningful content, not appear as isolated labels.',
        howToFix: 'Add explanatory copy below this heading or merge it with the next section.',
        heading: current,
      });
    }
  }

  if (wordCount >= 1000 && nonEmptyHeadings.length < Math.ceil(wordCount / 450)) {
    addIssue({
      ruleKey: 'DENSE_CONTENT_LOW_SUBHEADINGS',
      severity: 'medium',
      title: 'Large content blocks need clearer subheadings',
      recommendation: 'Improve readability by segmenting content into meaningful sections.',
      whyItMatters: 'Dense pages are harder to scan and can reduce user engagement.',
      howToFix: 'Add descriptive H2 or H3 headings every few paragraphs where the topic changes.',
    });
  }

  nonEmptyHeadings
    .filter((heading) => heading.level >= 5)
    .forEach((heading) => {
      addIssue({
        ruleKey: 'UNNECESSARY_HEADING_DEPTH',
        severity: 'low',
        title: `Deep H${heading.level} heading level`,
        recommendation: 'Simplify content structure for improved usability and crawl efficiency.',
        whyItMatters: 'Very deep heading levels often indicate over-nesting or unclear section grouping.',
        howToFix: 'Flatten the content structure by using H2 and H3 for most sections.',
        heading,
      });
    });

  const prefixMap = new Map();
  nonEmptyHeadings.forEach((heading) => {
    const prefix = normalizeText(heading.text).split(/\s+/).slice(0, 3).join(' ');
    if (!prefix || prefix.split(/\s+/).length < 2) return;
    prefixMap.set(prefix, [...(prefixMap.get(prefix) || []), heading]);
  });
  prefixMap.forEach((matches) => {
    if (matches.length < 3) return;
    matches.forEach((heading) => {
      addIssue({
        ruleKey: 'REPETITIVE_HEADING_PATTERN',
        severity: 'low',
        title: 'Repetitive heading pattern',
        recommendation: 'Consolidate repetitive subsections where appropriate.',
        whyItMatters: 'Repeated heading patterns make the outline feel duplicated and less useful.',
        howToFix: 'Merge similar sections or rewrite headings so each one has a distinct purpose.',
        heading,
      });
    });
  });

  const focus = normalizeText(focusKeyword);
  if (focus && firstH1 && !normalizeText(firstH1.text).includes(focus)) {
    addIssue({
      ruleKey: 'FOCUS_KEYWORD_MISSING_FROM_H1',
      severity: 'medium',
      title: 'Focus keyword missing from H1',
      recommendation: 'Incorporate the primary keyword naturally without keyword stuffing.',
      whyItMatters: 'The H1 should reinforce the main search topic detected for the page.',
      howToFix: `Include "${focusKeyword}" in the H1 naturally if it matches the actual page intent.`,
      heading: firstH1,
    });
  }

  if (focus) {
    nonEmptyHeadings.forEach((heading) => {
      const normalizedHeading = normalizeText(heading.text);
      const occurrences = normalizedHeading.split(focus).length - 1;

      if (occurrences >= 2) {
        addIssue({
          ruleKey: 'HEADING_KEYWORD_STUFFING',
          severity: 'medium',
          title: 'Keyword repeated unnaturally in heading',
          recommendation: 'Write headings naturally while maintaining keyword relevance.',
          whyItMatters: 'Keyword stuffing can reduce readability and may look manipulative to search engines.',
          howToFix: 'Use the keyword once, then rely on related terms and natural phrasing.',
          heading,
        });
      }
    });
  }

  const titleCaseCount = nonEmptyHeadings.filter((heading) => /^([A-Z][a-z0-9]+|[A-Z]{2,})(\s+([A-Z][a-z0-9]+|[A-Z]{2,}|&|and|of|for|to|in))*[?.!]?$/.test(heading.text)).length;
  const sentenceCaseCount = nonEmptyHeadings.filter((heading) => /^[A-Z][^A-Z]+/.test(heading.text)).length;
  if (nonEmptyHeadings.length >= 6 && titleCaseCount >= 2 && sentenceCaseCount >= 2) {
    addIssue({
      ruleKey: 'INCONSISTENT_HEADING_FORMATTING',
      severity: 'low',
      title: 'Inconsistent heading formatting',
      recommendation: 'Standardize heading formatting for professionalism and readability.',
      whyItMatters: 'Mixed capitalization and punctuation patterns make the page feel less polished.',
      howToFix: 'Use one heading style consistently, such as title case for major sections and sentence case for supporting sections.',
    });
  }

  return issues;
}

function detectFocusKeyword(html, title) {
  const m = html.match(/rank-?math|rankmath|yoast/i);
  const focus = extractMeta(html, 'rankmath:focus_keyword') || extractMeta(html, 'yoast:focuskw');
  if (focus) return { keyword: focus, source: 'meta' };
  if (title) {
    const tokens = title.split(/[|—–\-:]/)[0].trim();
    return { keyword: tokens || null, source: 'title-fallback', plugin: m ? m[0].toLowerCase() : null };
  }
  return { keyword: null, source: null, plugin: m ? m[0].toLowerCase() : null };
}

function trunc(s, n = 80) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function flagsFor({ title, h1Count, firstH1, metaDescription, viewport, schemaJsonLd, canonical, hasFooterAhm, hasPrivacyLink, hasTermsLink, hasCookieLink, hasFormPost, hasGtm, hasGa, lang }) {
  const flags = [];
  if (!title) flags.push('Missing <title> tag — page has no SEO title at all');
  else if (title.length < 25) flags.push(`Title too short: "${trunc(title)}" (${title.length} chars, target 25-70)`);
  else if (title.length > 70) flags.push(`Title too long: "${trunc(title)}" (${title.length} chars, target 25-70 — Google truncates >60)`);

  if (!metaDescription) flags.push('Missing meta description — Google will auto-generate (poor CTR)');
  else if (metaDescription.length < 70) flags.push(`Meta description too short: "${trunc(metaDescription)}" (${metaDescription.length} chars, target 70-175)`);
  else if (metaDescription.length > 175) flags.push(`Meta description too long: "${trunc(metaDescription)}" (${metaDescription.length} chars, Google truncates >155)`);

  if (h1Count === 0) flags.push('No <h1> heading on page — search engines and screen readers can\'t identify the main topic');
  else if (h1Count > 1) flags.push(`Multiple <h1> tags found (${h1Count} on page) — should be exactly 1; first one: "${trunc(firstH1 || '')}"`);

  if (!viewport) flags.push('Missing <meta name="viewport"> — page won\'t scale on mobile (will look broken on phones)');
  if (!canonical) flags.push('Missing <link rel="canonical"> — risks duplicate-content penalties');
  if (!schemaJsonLd) flags.push('No JSON-LD structured data — missing Schema.org markup (no rich snippets in Google)');
  if (!lang) flags.push('Missing <html lang="..."> attribute — accessibility + SEO hit');

  if (!hasFooterAhm) flags.push('Footer does NOT contain "Allied Health Media" — required AHM compliance check');
  if (!hasPrivacyLink) flags.push('No "Privacy Policy" link found anywhere on page (legal compliance)');
  if (!hasTermsLink) flags.push('No "Terms" link found (legal compliance)');
  if (!hasCookieLink) flags.push('No "Cookie Policy" link found (UK GDPR compliance)');
  if (!hasFormPost) flags.push('No <form> on page — visitors have no inline conversion path');
  if (!hasGtm && !hasGa) flags.push('No GTM container or GA tag detected — page traffic is invisible to analytics');

  return flags;
}

function extractNavigation(html) {
  // Look for the first <nav> element (or header > nav). Pull anchor text.
  const navMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)
    || html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  if (!navMatch) return [];
  const inner = navMatch[1];
  const items = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(inner))) {
    const href = m[1];
    const text = decodeEntities(m[2].replace(/<[^>]*>/g, '').trim());
    if (!text || text.length > 60) continue;
    if (/^#$|^javascript:|^mailto:|^tel:/i.test(href)) continue;
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    items.push({ text, href });
    if (items.length >= 12) break;
  }
  return items;
}

function countFormFields(html) {
  // Find every <form> on page, count visible <input>/<textarea>/<select> inside it.
  const formMatches = html.match(/<form\b[\s\S]*?<\/form>/gi) || [];
  if (formMatches.length === 0) return { formCount: 0, primaryFields: 0 };
  let max = 0;
  for (const f of formMatches) {
    const inputs = (f.match(/<input\b[^>]*>/gi) || []).filter((i) => !/type=["'](?:hidden|submit|button|image|reset)["']/i.test(i));
    const textareas = (f.match(/<textarea\b/gi) || []).length;
    const selects = (f.match(/<select\b/gi) || []).length;
    const total = inputs.length + textareas + selects;
    if (total > max) max = total;
  }
  return { formCount: formMatches.length, primaryFields: max };
}

function slugQuality(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '') || '/';
    if (path === '/') return { grade: 'A', reasons: [] };
    const segments = path.split('/').filter(Boolean);
    const reasons = [];
    let grade = 'A';
    const last = segments[segments.length - 1];
    if (/page_id=|p=\d+|\?[a-z]+=/i.test(u.search) || /^\d+$/.test(last)) { grade = 'D'; reasons.push('numeric/query-string slug'); }
    if (last && last.length > 60) { reasons.push('overly long slug'); if (grade === 'A') grade = 'B'; }
    if (last && /[A-Z]/.test(last)) { reasons.push('uppercase characters in slug'); if (grade === 'A') grade = 'B'; }
    if (last && /_/.test(last)) { reasons.push('underscores instead of hyphens'); if (grade === 'A') grade = 'B'; }
    if (segments.length > 4) { reasons.push(`deep URL (${segments.length} segments)`); if (grade === 'A') grade = 'B'; }
    return { grade, reasons, depth: segments.length };
  } catch {
    return { grade: 'F', reasons: ['unparseable URL'], depth: 0 };
  }
}

async function analyseUrl(url) {
  const { status, finalUrl, html, contentType } = await fetchHtml(url);
  if (status >= 400) {
    return { url, finalUrl, status, error: `HTTP ${status}`, flags: [`HTTP ${status}`] };
  }
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    return { url, finalUrl, status, error: `Non-HTML response (${contentType})`, flags: [`Not HTML: ${contentType}`] };
  }

  const title = extractTag(html, /<title[^>]*>([^<]*)<\/title>/i);
  const metaDescription = extractMeta(html, 'description');
  const { headings, headingCounts } = extractHeadings(html);
  const h1Count = headingCounts.h1;
  const firstH1 = headings.find((heading) => heading.level === 1)?.text || null;
  const viewport = extractMeta(html, 'viewport');
  const canonical = extractTag(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || extractTag(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const schemaJsonLd = countMatches(html, /<script[^>]+type=["']application\/ld\+json["']/gi) > 0;
  const lang = extractTag(html, /<html[^>]+lang=["']([^"']+)["']/i);

  const lowerHtml = html.toLowerCase();
  const hasFooterAhm = /allied\s*health\s*media/i.test(html);
  const hasPrivacyLink = /privacy[\s-]?policy/i.test(html);
  const hasTermsLink = /terms[\s-]?(of[\s-]?service|and[\s-]?conditions|&[\s-]?conditions)/i.test(html);
  const hasCookieLink = /cookie[\s-]?policy/i.test(html);
  const hasFormPost = /<form\b/i.test(html);
  const hasGtm = /googletagmanager\.com\/gtm\.js|gtm-[a-z0-9]+/i.test(html);
  const hasGa = /google-analytics\.com|gtag\(\s*['"]config['"]|ga\(\s*['"]create['"]/i.test(html);

  // CRO heuristics — trust signals, CTAs, contact, social proof
  const hasPhoneClickable = /<a[^>]+href=["']tel:/i.test(html);
  const hasEmailClickable = /<a[^>]+href=["']mailto:/i.test(html);
  const hasBookingLink = /book\s*(now|consultation|appointment|online)|schedule\s*(a|an)?\s*(consultation|appointment|call)|calendly|cal\.com\/|gohighlevel|leadconnectorhq/i.test(html);
  const hasTestimonials = /testimonials?|reviews?|patient[\s-]stor(y|ies)|what (our|my|patients) say|hear from (our|my) patients/i.test(html);
  const hasStarRating = /★|⭐|class=["'][^"']*(star|rating)[^"']*["']/i.test(html);
  const hasGoogleReviews = /google[\s-]?reviews?|trustpilot|doctify|iwgc/i.test(html);
  const hasGmcNumber = /gmc[\s:]*\d{6,7}|general medical council/i.test(html);
  const hasNhsMention = /\bnhs\b/i.test(html);
  const hasMedicalSchema = /"@type"\s*:\s*"(Physician|MedicalOrganization|MedicalBusiness|Hospital|HealthAndBeautyBusiness|MedicalClinic)"/i.test(html);
  const hasLocalBusinessSchema = /"@type"\s*:\s*"LocalBusiness"/i.test(html);
  const hasFaqSchema = /"@type"\s*:\s*"FAQPage"/i.test(html);
  const ctaButtonCount = (html.match(/<(button|a)[^>]*class=["'][^"']*(cta|button|btn)[^"']*["']/gi) || []).length;

  const focus = detectFocusKeyword(html, title);
  const nav = extractNavigation(html);
  const links = await annotateLinkStatuses(extractLinks(html, finalUrl || url));
  const seoLinks = buildSeoLinks(links);
  const pageText = stripHtmlToText(html);
  const wordCount = countWords(pageText);
  const anchorIssues = analyzeAnchorIssues({ links: seoLinks, wordCount });
  const forms = countFormFields(html);
  const slug = slugQuality(finalUrl || url);
  const noindex = hasNoindex(html);
  const schemaTypes = detectSchemaTypes(html);
  const headingIssues = analyzeHeadingIssues({
    html,
    headings,
    headingCounts,
    focusKeyword: focus?.keyword || null,
  });
  const onPageIssues = analyzeOnPageIssues({
    url,
    finalUrl,
    html,
    title,
    metaDescription,
    firstH1,
    h1Count,
    headings,
    headingIssues,
    canonical,
    schemaJsonLd,
    schemaTypes,
    viewport,
    lang,
    focusKeyword: focus?.keyword || null,
    links,
    noindex,
    hasPhoneClickable,
    hasEmailClickable,
    hasBookingLink,
    hasTestimonials,
    hasStarRating,
    hasGoogleReviews,
    hasMedicalSchema,
    hasLocalBusinessSchema,
    hasFaqSchema,
    status,
  });

  const flags = flagsFor({
    title, h1Count, firstH1, metaDescription, viewport, schemaJsonLd, canonical,
    hasFooterAhm, hasPrivacyLink, hasTermsLink, hasCookieLink, hasFormPost, hasGtm, hasGa, lang,
  });

  // CRO flags — verbose so Usama can see exactly what was checked
  if (!hasPhoneClickable && !hasEmailClickable && !hasFormPost) {
    flags.push('No conversion path on page — searched for: <a href="tel:...">, <a href="mailto:...">, and <form> — none of the three found');
  } else if (!hasPhoneClickable) {
    flags.push('No clickable phone number — searched for <a href="tel:..."> — not found (mobile users can\'t tap-to-call)');
  }
  if (!hasBookingLink && hasFormPost === false) {
    flags.push('No booking/appointment CTA — searched for: "book now", "book consultation", "schedule appointment", calendly.com, cal.com, leadconnectorhq, gohighlevel — none found');
  }
  if (!hasTestimonials && !hasStarRating && !hasGoogleReviews) {
    flags.push('No social proof on page — searched for: testimonials, reviews, patient stories, ★/⭐ rating widgets, Google Reviews, Trustpilot, Doctify, IWGC — none found');
  }
  if (!hasMedicalSchema && !hasLocalBusinessSchema) {
    flags.push('No medical or local-business Schema.org markup — searched JSON-LD for @type Physician/MedicalOrganization/MedicalClinic/LocalBusiness — none found (no rich snippets in Google search)');
  }
  if (ctaButtonCount === 0) {
    flags.push('No styled CTA buttons detected — searched for <button> or <a class="cta|button|btn"> — zero found (no clear next action for visitors)');
  } else if (ctaButtonCount > 8) {
    flags.push(`Many competing CTAs detected (${ctaButtonCount} buttons on page) — Aagaard LPO principle: every page needs ONE primary action; too many splits attention`);
  }
  // Suppress homepage-only CRO flags on blog posts / individual articles —
  // it's normal not to have a booking form / GMC number / styled CTA on a
  // long-form article. Detect "blog-ish" URLs by path heuristics.
  const isBlogish = (() => {
    try {
      const u = new URL(url);
      const p = u.pathname;
      if (/\/(blog|news|article|insight|insights|press|story|stories)\//.test(p)) return true;
      // WP-style /post-slug/numeric-id/ or /post-slug-with-many-words/
      if (/\/[a-z0-9-]{20,}\/(?:\d+\/)?$/.test(p)) return true;
      return false;
    } catch { return false; }
  })();
  if (isBlogish) {
    // Blog posts get a slimmer CRO check — only the most critical signals.
    // Drop form-missing, booking-CTA, GMC, and competing-CTA flags here.
    const blogIgnore = /(No <form>|No booking\/appointment CTA|No GMC number|Many competing CTAs|No styled CTA buttons)/i;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (blogIgnore.test(flags[i])) flags.splice(i, 1);
    }
  }

  // Form-friction flag — long forms hurt conversion
  if (forms.primaryFields >= 8) {
    flags.push(`Long contact form (${forms.primaryFields} visible fields) — Aagaard LPO: shorter forms convert better, target 3-5 fields`);
  }

  // Slug quality flag — only emit for clearly bad slugs
  if (slug.grade === 'D' || slug.grade === 'F') {
    flags.push(`Poor URL slug — ${slug.reasons.join(', ')} — patients and Google prefer descriptive slugs like "/sinusitis-treatment"`);
  }

  return {
    url,
    finalUrl,
    status,
    title,
    metaDescription,
    h1Count,
    firstH1,
    headings,
    headingCounts,
    headingIssues,
    onPageIssues,
    anchorIssues,
    viewport,
    canonical,
    lang,
    schemaJsonLd,
    schemaTypes,
    noindex,
    focusKeyword: focus,
    compliance: {
      footerAhm: hasFooterAhm,
      privacy: hasPrivacyLink,
      terms: hasTermsLink,
      cookie: hasCookieLink,
      form: hasFormPost,
      gtm: hasGtm,
      ga: hasGa,
    },
    cro: {
      phoneClickable: hasPhoneClickable,
      emailClickable: hasEmailClickable,
      bookingLink: hasBookingLink,
      testimonials: hasTestimonials,
      starRating: hasStarRating,
      googleReviews: hasGoogleReviews,
      gmcNumber: hasGmcNumber,
      nhsMention: hasNhsMention,
      medicalSchema: hasMedicalSchema,
      localBusinessSchema: hasLocalBusinessSchema,
      faqSchema: hasFaqSchema,
      ctaButtonCount,
    },
    nav,
    links,
    seoLinks,
    forms,
    slug,
    flags,
  };
}

module.exports = { analyseUrl, fetchHtml };
