// Shared audit pipeline — used by both the daily cron run and the
// on-demand Discord listener. Keeps the orchestration in one place so
// both code paths produce identical output formats.

const fs = require('fs');
const path = require('path');

const { discoverPages } = require('./crawl');
const { auditUrl: lighthouseAudit } = require('./lighthouse');
const { analyseUrl, fetchHtml } = require('./seo');
const { auditPageImages } = require('./images');
const { visionAuditUrl } = require('./vision');
const { captureHero } = require('./screenshots');
const {
  buildClientMarkdown,
  summariseClient,
  saveReportToDrive,
  savePdfToDrive,
  saveLocalReport,
  generatePdf,
} = require('./report');

async function auditPage(url, { runVision, captureScreenshot = true, screenshotMobile = false }) {
  const out = { url, errors: [] };
  try {
    out.seo = await analyseUrl(url);
    if (out.seo.error) out.errors.push(`seo: ${out.seo.error}`);
    const { html } = await fetchHtml(url).catch(() => ({ html: '' }));
    if (html) out.images = await auditPageImages(html, url);
  } catch (err) {
    out.errors.push(`seo-fetch: ${err.message}`.slice(0, 200));
  }

  // Hero screenshot for embedding in the PDF report. Captured for every
  // audited page (cheap; reuses a shared puppeteer browser).
  if (captureScreenshot) {
    try {
      const desktop = await captureHero(url, { viewport: 'desktop', quality: 60 });
      out.heroDesktopB64 = desktop;
      if (screenshotMobile) {
        const mobile = await captureHero(url, { viewport: 'mobile', quality: 55 });
        out.heroMobileB64 = mobile;
      }
    } catch (err) {
      out.errors.push(`screenshot: ${err.message}`.slice(0, 200));
    }
  }

  if (runVision) {
    try { out.vision = await visionAuditUrl(url); }
    catch (err) { out.vision = { error: String(err.message).slice(0, 200) }; }
  }
  return out;
}

function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ANCHOR_GRAPH_QUALITY_PLACEMENTS = new Set([
  'main_content',
  'article_content',
  'in_content_cta',
]);

function isAnchorGraphQualityLink(link) {
  return ANCHOR_GRAPH_QUALITY_PLACEMENTS.has(link.placement || 'main_content');
}

function addCrossPageOnPageIssue(page, issue) {
  if (!page.seo) return;
  page.seo.onPageIssues = page.seo.onPageIssues || [];
  page.seo.onPageIssues.push(issue);
}

function addCrossPageAnchorIssue(page, issue) {
  if (!page.seo) return;
  page.seo.anchorIssues = page.seo.anchorIssues || [];
  page.seo.anchorIssues.push(issue);
}

function getPageSeoLinks(page) {
  return page.seo?.seoLinks?.length ? page.seo.seoLinks : page.seo?.links || [];
}

function annotateCrossPageSeoIssues(audit) {
  const pages = audit.pages.filter((page) => page.seo && !page.seo.error);
  const byTitle = new Map();
  const byMeta = new Map();
  const byFocus = new Map();
  const scannedUrls = new Map();
  const incomingByUrl = new Map();
  const siteAnchorsByText = new Map();
  const siteAnchorsByHref = new Map();

  pages.forEach((page) => {
    const title = normalizeComparableText(page.seo.title);
    const metaDescription = normalizeComparableText(page.seo.metaDescription);
    const focusKeyword = normalizeComparableText(page.seo.focusKeyword?.keyword);
    const pageUrl = page.seo.finalUrl || page.seo.url || page.url;

    if (title) byTitle.set(title, [...(byTitle.get(title) || []), page]);
    if (metaDescription) byMeta.set(metaDescription, [...(byMeta.get(metaDescription) || []), page]);
    if (focusKeyword) byFocus.set(focusKeyword, [...(byFocus.get(focusKeyword) || []), page]);
    if (pageUrl) scannedUrls.set(pageUrl.replace(/\/+$/, ''), page);

    getPageSeoLinks(page).forEach((link) => {
      const href = String(link.href || '').replace(/\/+$/, '');
      const text = normalizeComparableText(link.accessibleText || link.anchorText);

      if (link.isInternal && href) {
        incomingByUrl.set(href, [...(incomingByUrl.get(href) || []), { page, link }]);
      }

      if (isAnchorGraphQualityLink(link)) {
        if (text) siteAnchorsByText.set(text, [...(siteAnchorsByText.get(text) || []), { page, link }]);
        if (href) siteAnchorsByHref.set(href, [...(siteAnchorsByHref.get(href) || []), { page, link }]);
      }
    });
  });

  byTitle.forEach((matches) => {
    if (matches.length < 2) return;
    matches.forEach((page) => {
      addCrossPageOnPageIssue(page, {
        ruleKey: 'DUPLICATE_TITLE_ACROSS_PAGES',
        severity: 'warning',
        title: 'Duplicate title across scanned pages',
        recommendation: 'Make each title tag unique.',
        whyItMatters: 'Duplicate titles make pages compete with each other and reduce search-result clarity.',
        howToFix: 'Rewrite this title around the specific page topic, service, condition, or location.',
        rowKey: 'meta-title',
      });
    });
  });

  byMeta.forEach((matches) => {
    if (matches.length < 2) return;
    matches.forEach((page) => {
      addCrossPageOnPageIssue(page, {
        ruleKey: 'DUPLICATE_META_DESCRIPTION_ACROSS_PAGES',
        severity: 'warning',
        title: 'Duplicate meta description across scanned pages',
        recommendation: 'Write a unique meta description for each page.',
        whyItMatters: 'Duplicate snippets reduce topical clarity and click-through relevance.',
        howToFix: 'Describe the unique value, topic, and CTA for this specific page.',
        rowKey: 'meta-description',
      });
    });
  });

  byFocus.forEach((matches) => {
    if (matches.length < 2) return;
    matches.forEach((page) => {
      addCrossPageOnPageIssue(page, {
        ruleKey: 'POTENTIAL_KEYWORD_CANNIBALIZATION',
        severity: 'suggestion',
        title: 'Potential keyword overlap across scanned pages',
        recommendation: 'Make sure each page targets a distinct primary search intent.',
        whyItMatters: 'Multiple pages targeting the same focus keyword can compete against each other.',
        howToFix: 'Differentiate the title, H1, URL, and content angle for each overlapping page.',
        rowKey: 'keywords',
      });
    });
  });

  scannedUrls.forEach((page, url) => {
    const incoming = (incomingByUrl.get(url) || []).filter((entry) => entry.page.url !== page.url);

    if (incoming.length === 0) {
      addCrossPageAnchorIssue(page, {
        ruleKey: 'ORPHAN_PAGE',
        severity: 'critical',
        title: 'No incoming internal links from scanned pages',
        recommendation: 'Add internal links pointing to this page to improve discoverability and SEO value.',
        whyItMatters: 'Pages without incoming internal links are harder for users and search engines to discover.',
        howToFix: 'Link to this page from related parent, service, condition, or homepage sections.',
        anchorIndex: null,
        anchorText: null,
        href: page.seo.finalUrl || page.seo.url || page.url,
      });
    }
  });

  siteAnchorsByText.forEach((entries) => {
    const hrefs = new Set(entries.map((entry) => String(entry.link.href || '').replace(/\/+$/, '')));

    if (hrefs.size > 1) {
      entries.forEach(({ page, link }) => {
        addCrossPageAnchorIssue(page, {
          ruleKey: 'SITEWIDE_SAME_ANCHOR_DIFFERENT_PAGES',
          severity: 'warning',
          title: 'Same anchor text links to different pages across scanned pages',
          recommendation: 'Avoid using identical anchor text for different destination pages to reduce ambiguity.',
          whyItMatters: 'Site-wide anchor consistency helps search engines understand which page owns a topic.',
          howToFix: 'Rewrite anchors so each destination has a distinct, descriptive phrase.',
          anchorIndex: link.index,
          anchorText: link.accessibleText || link.anchorText,
          href: link.href,
        });
      });
    }

    if (entries.length >= 12) {
      entries.forEach(({ page, link }) => {
        addCrossPageAnchorIssue(page, {
          ruleKey: 'SITEWIDE_EXACT_ANCHOR_OVERUSE',
          severity: 'warning',
          title: 'Exact-match anchor is heavily repeated across scanned pages',
          recommendation: 'Avoid excessive exact-match anchor text. Use semantic variations for a more natural link profile.',
          whyItMatters: 'Repeated exact-match anchors can look over-optimized.',
          howToFix: 'Use natural variants that still describe the linked page accurately.',
          anchorIndex: link.index,
          anchorText: link.accessibleText || link.anchorText,
          href: link.href,
        });
      });
    }
  });

  siteAnchorsByHref.forEach((entries) => {
    const texts = new Set(
      entries
        .map((entry) => normalizeComparableText(entry.link.accessibleText || entry.link.anchorText))
        .filter(Boolean),
    );

    if (texts.size >= 8) {
      entries.forEach(({ page, link }) => {
        addCrossPageAnchorIssue(page, {
          ruleKey: 'SITEWIDE_MANY_ANCHORS_SAME_PAGE',
          severity: 'suggestion',
          title: 'Many different anchors point to the same page across scanned pages',
          recommendation: 'Maintain consistent topical relevance in anchor text pointing to the same page.',
          whyItMatters: 'Too many unrelated anchor variants can blur the linked page topic.',
          howToFix: 'Keep anchor variants semantically related to the destination topic.',
          anchorIndex: link.index,
          anchorText: link.accessibleText || link.anchorText,
          href: link.href,
        });
      });
    }
  });
}

/**
 * Runs the full audit pipeline against a single client.
 * Used by the daily cron AND by the Discord on-demand listener.
 *
 * @param {object} client — { name, url, status, developer?, team? }
 * @param {object} options
 *   @param {number} options.maxPages — page cap (default 5; on-demand uses 3)
 *   @param {number} options.maxVisionPages — vision-review page cap (default 2; on-demand uses 1)
 *   @param {function} options.log — log function (msg) => void
 */
async function auditClient(client, options = {}) {
  const {
    maxPages = parseInt(process.env.QA_MAX_PAGES_PER_SITE || '5', 10),
    maxVisionPages = parseInt(process.env.QA_MAX_PAGES_FOR_VISION || '2', 10),
    log = () => {},
  } = options;

  const runAt = new Date().toISOString();
  log(`[client] ${client.name} → ${client.url}`);
  const audit = { client, runAt, pages: [], errors: [] };

  let pages = [client.url];
  try {
    pages = await discoverPages(client.url, { maxPages });
  } catch (err) {
    audit.errors.push(`discover: ${err.message}`.slice(0, 200));
    pages = [client.url];
  }

  audit.lighthouse = await lighthouseAudit(client.url).catch((err) => {
    audit.errors.push(`lighthouse: ${err.message}`.slice(0, 200));
    return null;
  });

  for (let i = 0; i < pages.length; i++) {
    const url = pages[i];
    const runVision = i < maxVisionPages;
    // Capture mobile hero only on the homepage — that's all the report shows.
    const screenshotMobile = i === 0;
    const pageAudit = await auditPage(url, { runVision, captureScreenshot: true, screenshotMobile });
    audit.pages.push(pageAudit);
  }

  annotateCrossPageSeoIssues(audit);

  return audit;
}

function safeName(s) {
  return String(s).replace(/[\\/:"*?<>|]+/g, '-').trim().slice(0, 80);
}

/**
 * Persists an audit:
 *  - writes .md and .pdf locally
 *  - uploads Google Doc + PDF to Drive (parallel)
 * Returns { driveLink, pdfLink, localMdPath, localPdfPath, summary }
 */
async function persistAudit(audit, { reportsDir, log = () => {} } = {}) {
  const client = audit.client;
  const folderId = process.env.REPORTS_DRIVE_FOLDER_ID;
  const date = new Date().toISOString().slice(0, 10);
  const fileBase = `${safeName(client.name)} — Website QA — ${date}`;

  // ─── AI narrative (Claude Sonnet) — writes bespoke editorial copy ───
  // Generated lazily inside generatePdf via the buildHtml path; we compute
  // it here so it's also reusable elsewhere if needed in future.
  try {
    const { writeNarrative } = require('./aiNarrative');
    const { siteScore } = require('./score');
    const { checkSiteStrengths } = require('./strengths');
    const { gatherIssues, groupIssues } = require('./report');
    const scoring = siteScore(audit);
    const issues = gatherIssues(client, audit);
    const grouped = groupIssues(issues).sort((a, b) => {
      const r = { high: 0, medium: 1, low: 2 };
      if (r[a.severity] !== r[b.severity]) return r[a.severity] - r[b.severity];
      return b.occurrences - a.occurrences;
    });
    const strengths = checkSiteStrengths(audit);
    audit.narrative = await writeNarrative({ client, audit, scoring, issues: grouped, strengths, log });
    if (audit.narrative) log(`[narrative] generated for ${client.name}`);
  } catch (err) {
    log(`[narrative] error for ${client.name}: ${err.message}`);
    audit.narrative = null;
  }

  const md = buildClientMarkdown(client, audit);

  // Local copies
  const dailyDir = path.join(reportsDir, date);
  const localMdPath = saveLocalReport({ md, fileName: `${safeName(client.name)}.md`, dir: dailyDir });

  // PDF — generate once, save locally + upload to Drive
  let pdfBuffer = null;
  let localPdfPath = null;
  try {
    const { pdf } = await generatePdf(client, audit);
    pdfBuffer = pdf;
    localPdfPath = path.join(dailyDir, `${safeName(client.name)}.pdf`);
    fs.mkdirSync(dailyDir, { recursive: true });
    fs.writeFileSync(localPdfPath, pdfBuffer);
  } catch (err) {
    log(`[pdf] generate failed for ${client.name}: ${err.message}`);
  }

  // Upload Doc + PDF to Drive in parallel
  let driveLink = null; let pdfLink = null;
  if (folderId) {
    const ops = [];
    ops.push(saveReportToDrive({ md, fileName: fileBase, parentFolderId: folderId })
      .then((file) => { driveLink = file.webViewLink || null; })
      .catch((err) => log(`[drive] doc upload failed for ${client.name}: ${err.message}`)));
    if (pdfBuffer) {
      ops.push(savePdfToDrive({ pdfBuffer, fileName: `${fileBase}.pdf`, parentFolderId: folderId })
        .then((file) => { pdfLink = file.webViewLink || null; })
        .catch((err) => log(`[drive] pdf upload failed for ${client.name}: ${err.message}`)));
    }
    await Promise.all(ops);
  }

  const summary = summariseClient(client, audit);
  summary.reportLink = driveLink;
  summary.pdfLink = pdfLink;

  return { driveLink, pdfLink, localMdPath, localPdfPath, pdfBuffer, summary };
}

module.exports = { auditClient, auditPage, persistAudit };
