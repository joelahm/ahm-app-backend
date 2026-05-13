const fs = require('fs');
const path = require('path');
const dns = require('dns/promises');
const net = require('net');
const { spawn } = require('child_process');
const JSZip = require('jszip');
const sharp = require('sharp');

const { AppError } = require('../../lib/errors');
const {
  proseMirrorToPlainText,
  validateDescriptionJson,
} = require('../../lib/prosemirror');

const RUN_STATUS = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

const ACTIVE_RUN_STATUSES = [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING];
const RAW_OUTPUT_MAX_LENGTH = 1_000_000;
const RESULT_OUTPUT_MAX_LENGTH = 15_000_000;
const WEBP_EXPORT_MAX_IMAGES = 50;
const WEBP_EXPORT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const WEBP_EXPORT_TIMEOUT_MS = 15000;
const WEBP_EXPORT_USER_AGENT = 'AHMApp WebP Export/1.0';
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);
const PDF_REPORT_VERSION = 'claude-on-page-v1';

function toBigIntId(value, label) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${label}.`);
  }

  return BigInt(Math.trunc(parsed));
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

function isBlockedIpv6(address) {
  const normalized = String(address || '').toLowerCase();

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
    throw new AppError(400, 'VALIDATION_ERROR', 'Image URL host is not allowed.');
  }

  const directIpFamily = net.isIP(hostname);
  if (directIpFamily && isBlockedAddress(hostname)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Image URL host is not allowed.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Image URL host could not be resolved.');
  }

  if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Image URL host is not allowed.');
  }
}

function parseExportImageUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('Image URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https image URLs are supported.');
  }

  return parsed;
}

function safeFilenameStem(value) {
  const raw = String(value || 'image')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return raw || 'image';
}

function uniqueWebpFilename(image, usedNames) {
  const sourceName = image.filename || (() => {
    try {
      return path.basename(new URL(image.src).pathname);
    } catch {
      return 'image';
    }
  })();
  const stem = safeFilenameStem(sourceName);
  const currentCount = usedNames.get(stem) || 0;

  usedNames.set(stem, currentCount + 1);

  return currentCount === 0 ? `${stem}.webp` : `${stem}-${currentCount + 1}.webp`;
}

function safeZipClientName(client) {
  return safeFilenameStem(client.clientName || client.businessName || `client-${client.id}`);
}

function safeReportName(value) {
  return String(value || 'AHM Client')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'AHM Client';
}

function appendOutput(current, chunk) {
  const next = `${current}${chunk}`;

  if (next.length <= RAW_OUTPUT_MAX_LENGTH) {
    return next;
  }

  return next.slice(next.length - RAW_OUTPUT_MAX_LENGTH);
}

function appendResultOutput(current, chunk) {
  const next = `${current}${chunk}`;

  if (next.length > RESULT_OUTPUT_MAX_LENGTH) {
    throw new Error('Website QA bot output exceeded the maximum supported size.');
  }

  return next;
}

function normalizeAuditUrl(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Website URL is required.');
  }

  const withProtocol = /^https?:\/\//i.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;

  let parsed;

  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Website URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Website URL must use http or https.');
  }

  if (/sitemap[^/]*\.xml$/i.test(parsed.pathname)) {
    return `${parsed.origin}/`;
  }

  parsed.hash = '';

  return parsed.toString();
}

function getBotDirectory() {
  return (
    process.env.WEBSITE_QA_BOT_DIR ||
    path.resolve(process.cwd(), '..', '..', 'Website QA bot')
  );
}

function getBotScriptPath(botDirectory) {
  return path.join(botDirectory, 'bot.js');
}

function assertBotExists() {
  const botDirectory = getBotDirectory();
  const botScriptPath = getBotScriptPath(botDirectory);

  if (!fs.existsSync(botScriptPath)) {
    throw new AppError(
      500,
      'CONFIGURATION_ERROR',
      `Website QA bot was not found at ${botScriptPath}.`,
    );
  }

  return { botDirectory, botScriptPath };
}

function assertBotReportsPath(filePath) {
  const resolvedPath = path.resolve(filePath);
  const botReportsPath = path.resolve(getBotDirectory(), 'reports');

  if (!resolvedPath.startsWith(botReportsPath)) {
    throw new AppError(403, 'FORBIDDEN', 'PDF report path is not allowed.');
  }

  return resolvedPath;
}

function resolveChromeExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function configurePdfChromeExecutable() {
  const executablePath = resolveChromeExecutablePath();

  if (executablePath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
  }
}

function stripOmittedScreenshots(value) {
  return JSON.parse(JSON.stringify(value, (key, childValue) => {
    if (
      (key === 'heroDesktopB64' || key === 'heroMobileB64') &&
      childValue === '[base64 screenshot omitted]'
    ) {
      return null;
    }

    return childValue;
  }));
}

async function enrichAuditWithAiNarrative({ botDirectory, client, audit }) {
  try {
    const { writeNarrative } = require(path.join(botDirectory, 'lib', 'aiNarrative'));
    const { siteScore } = require(path.join(botDirectory, 'lib', 'score'));
    const { checkSiteStrengths } = require(path.join(botDirectory, 'lib', 'strengths'));
    const { gatherIssues, groupIssues } = require(path.join(botDirectory, 'lib', 'report'));
    const scoring = siteScore(audit);
    const issues = gatherIssues(client, audit);
    const groupedIssues = groupIssues(issues).sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      const severityDiff = rank[a.severity] - rank[b.severity];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return b.occurrences - a.occurrences;
    });
    const strengths = checkSiteStrengths(audit);
    const narrative = await writeNarrative({
      audit,
      client,
      issues: groupedIssues,
      log: (message) => console.log(`[on-page-optimization:pdf] ${message}`),
      scoring,
      strengths,
    });

    return {
      ...audit,
      narrative: narrative || audit.narrative || null,
    };
  } catch (error) {
    console.error(
      '[on-page-optimization:pdf] AI narrative generation failed',
      error,
    );

    return audit;
  }
}

function parseAuditResult(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('__AUDIT_RESULT__'));

  if (!line) {
    throw new Error('Website QA bot did not return an audit result.');
  }

  return JSON.parse(line.slice('__AUDIT_RESULT__'.length));
}

function buildRunnerScript() {
  return `
const path = require('path');
const { auditClient, persistAudit } = require('./lib/audit');
const { closeBrowser: closeLhBrowser } = require('./lib/lighthouse');
const { closeBrowser: closeVisionBrowser } = require('./lib/vision');
const { closeBrowser: closePdfBrowser } = require('./lib/pdf');

function stripLargeAuditFields(audit) {
  return JSON.parse(JSON.stringify(audit, (key, value) => {
    if (key === 'heroDesktopB64' || key === 'heroMobileB64') {
      return value ? '[base64 screenshot omitted]' : value;
    }
    return value;
  }));
}

async function closeBrowsers() {
  await Promise.all([
    closeVisionBrowser().catch(() => {}),
    closeLhBrowser().catch(() => {}),
    closePdfBrowser().catch(() => {}),
  ]);
}

(async () => {
  const client = {
    name: process.env.QA_CLIENT_NAME || 'AHM Client',
    url: process.env.QA_TARGET_URL,
    status: 'AHM On-Page Optimization',
    developer: '',
    team: '',
    notes: '',
  };

  const audit = await auditClient(client, {
    maxPages: Number(process.env.QA_ONDEMAND_MAX_PAGES || process.env.QA_MAX_PAGES_PER_SITE || 5),
    maxVisionPages: Number(process.env.QA_ONDEMAND_VISION_PAGES || process.env.QA_MAX_PAGES_FOR_VISION || 2),
    log: (message) => console.error(message),
  });
  const persisted = await persistAudit(audit, {
    reportsDir: path.join(process.cwd(), 'reports'),
    log: (message) => console.error(message),
  });
  const { pdfBuffer, ...safePersisted } = persisted;

  console.log('__AUDIT_RESULT__' + JSON.stringify({
    ok: true,
    ...safePersisted,
    audit: stripLargeAuditFields(audit),
  }));
  await closeBrowsers();
})().catch(async (error) => {
  console.log('__AUDIT_RESULT__' + JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  await closeBrowsers();
  process.exit(1);
});
`;
}

function serializeRun(run) {
  return {
    id: run.id.toString(),
    clientId: run.clientId.toString(),
    websiteUrl: run.websiteUrl,
    sitemapUrl: run.sitemapUrl ?? null,
    status: run.status,
    healthScore: run.healthScore,
    healthGrade: run.healthGrade,
    healthStatus: run.healthStatus,
    pagesAudited: run.pagesAudited,
    highIssues: run.highIssues,
    mediumIssues: run.mediumIssues,
    lowIssues: run.lowIssues,
    pdfPath: run.pdfPath,
    markdownPath: run.markdownPath,
    pdfLink: run.pdfLink,
    driveLink: run.driveLink,
    summary: run.summaryJson,
    result: run.resultJson,
    failureMessage: run.failureMessage,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    createdBy: run.createdBy ? run.createdBy.toString() : null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function mapActivityUser(user) {
  if (!user) return null;

  const name = [user.firstName, user.lastName]
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .join(' ');

  return {
    id: Number(user.id),
    name: name || user.email || 'User',
    avatarUrl: user.avatarUrl ?? null,
  };
}

function serializePageActivity(activity, usersById = new Map()) {
  const actor = activity.actorUserId
    ? mapActivityUser(usersById.get(String(activity.actorUserId)))
    : null;

  if (activity.kind === 'EVENT') {
    return {
      kind: 'event',
      id: Number(activity.id),
      type: activity.type || 'PAGE_UPDATED',
      metadata: activity.metadataJson ?? {},
      createdAt: activity.createdAt.toISOString(),
      actor,
    };
  }

  return {
    kind: 'comment',
    id: Number(activity.id),
    body: activity.comment || '',
    bodyJson: activity.bodyJson ?? null,
    createdAt: activity.createdAt.toISOString(),
    createdBy: actor,
  };
}

async function assertClientAccess({ db, clientId, actorRole, actorUserId }) {
  const where =
    actorRole === 'ADMIN'
      ? { id: clientId }
      : {
          id: clientId,
          OR: [{ assignedTo: BigInt(actorUserId) }, { createdBy: BigInt(actorUserId) }],
        };

  const client = await db.client.findFirst({
    where,
    select: {
      id: true,
      clientName: true,
      businessName: true,
      website: true,
      onPageOptimizationSitemapUrl: true,
    },
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  return client;
}

async function assertRunAccess({ db, clientId, runId, actorRole, actorUserId }) {
  const clientIdValue = toBigIntId(clientId, 'client id');
  const runIdValue = toBigIntId(runId, 'run id');

  await assertClientAccess({
    db,
    clientId: clientIdValue,
    actorRole,
    actorUserId,
  });

  const run = await db.clientOnPageOptimizationRun.findFirst({
    where: {
      id: runIdValue,
      clientId: clientIdValue,
    },
    select: {
      id: true,
      clientId: true,
    },
  });

  if (!run) {
    throw new AppError(404, 'NOT_FOUND', 'On-page optimization run not found.');
  }

  return run;
}

function readPageUrl(value) {
  const pageUrl = String(value || '').trim();

  if (!pageUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pageUrl is required.');
  }

  if (pageUrl.length > 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pageUrl is too long.');
  }

  return pageUrl;
}

function readRequestedWebsiteUrl({ client, payload }) {
  return normalizeAuditUrl(
    payload?.websiteUrl ||
      payload?.sitemapUrl ||
      client.website ||
      '',
  );
}

function readRequestedSitemapUrl(payload) {
  const value = String(payload?.sitemapUrl || payload?.websiteUrl || '').trim();

  if (!value) {
    return null;
  }

  if (value.length > 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Sitemap URL is too long.');
  }

  return value;
}

async function getSettings({ db, clientId, actorRole, actorUserId }) {
  const clientIdValue = toBigIntId(clientId, 'client id');
  const client = await assertClientAccess({
    db,
    clientId: clientIdValue,
    actorRole,
    actorUserId,
  });

  return {
    sitemapUrl: client.onPageOptimizationSitemapUrl ?? null,
  };
}

async function updateSettings({ db, clientId, actorRole, actorUserId, payload }) {
  const clientIdValue = toBigIntId(clientId, 'client id');

  await assertClientAccess({
    db,
    clientId: clientIdValue,
    actorRole,
    actorUserId,
  });

  const sitemapUrl = readRequestedSitemapUrl(payload);
  const client = await db.client.update({
    where: { id: clientIdValue },
    data: {
      onPageOptimizationSitemapUrl: sitemapUrl,
    },
    select: {
      onPageOptimizationSitemapUrl: true,
    },
  });

  return {
    sitemapUrl: client.onPageOptimizationSitemapUrl ?? null,
  };
}

async function listRuns({ db, clientId, actorRole, actorUserId }) {
  const clientIdValue = toBigIntId(clientId, 'client id');

  await assertClientAccess({
    db,
    clientId: clientIdValue,
    actorRole,
    actorUserId,
  });

  const runs = await db.clientOnPageOptimizationRun.findMany({
    where: { clientId: clientIdValue },
    orderBy: { createdAt: 'desc' },
  });

  return runs.map(serializeRun);
}

async function getRun({ db, clientId, runId, actorRole, actorUserId }) {
  const runAccess = await assertRunAccess({
    db,
    clientId,
    runId,
    actorRole,
    actorUserId,
  });
  const run = await db.clientOnPageOptimizationRun.findUnique({
    where: { id: runAccess.id },
  });

  if (!run) {
    throw new AppError(404, 'NOT_FOUND', 'On-page optimization run not found.');
  }

  return serializeRun(run);
}

function runBotProcess({ botDirectory, botScriptPath, websiteUrl, clientName }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['-e', buildRunnerScript()],
      {
        cwd: botDirectory,
        env: {
          ...process.env,
          QA_TARGET_URL: websiteUrl,
          QA_CLIENT_NAME: clientName,
          QA_ONDEMAND_MAX_PAGES:
            process.env.QA_ONDEMAND_MAX_PAGES ||
            process.env.QA_MAX_PAGES_PER_SITE ||
            '5',
          QA_ONDEMAND_VISION_PAGES:
            process.env.QA_ONDEMAND_VISION_PAGES ||
            process.env.QA_MAX_PAGES_FOR_VISION ||
            '2',
        },
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      try {
        stdout = appendResultOutput(stdout, chunk.toString());
      } catch (error) {
        child.kill('SIGTERM');
        resolve({
          ok: false,
          error: error.message,
          stdout,
          stderr,
        });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr = appendOutput(stderr, chunk.toString());
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        error: error.message,
        stdout,
        stderr,
      });
    });

    child.on('close', (code, signal) => {
      try {
        const result = parseAuditResult(stdout);

        resolve({
          ok: code === 0 && result.ok !== false,
          result,
          stdout,
          stderr,
          code,
          signal,
        });
      } catch (error) {
        resolve({
          ok: false,
          error: error.message,
          stdout,
          stderr,
          code,
          signal,
        });
      }
    });
  });
}

async function executeRun({ db, runId, clientName, websiteUrl }) {
  const runIdValue = BigInt(runId);

  await db.clientOnPageOptimizationRun.update({
    where: { id: runIdValue },
    data: {
      status: RUN_STATUS.RUNNING,
      startedAt: new Date(),
      failureMessage: null,
    },
  });

  try {
    const bot = assertBotExists();
    const output = await runBotProcess({
      ...bot,
      websiteUrl,
      clientName,
    });
    const rawOutput = appendOutput(output.stdout || '', output.stderr || '');

    if (!output.ok) {
      const failureMessage =
        output.result?.error ||
        output.error ||
        `Website QA bot failed${output.code ? ` with code ${output.code}` : ''}.`;

      await db.clientOnPageOptimizationRun.update({
        where: { id: runIdValue },
        data: {
          status: RUN_STATUS.FAILED,
          failureMessage,
          resultJson: output.result || null,
          rawOutput,
          completedAt: new Date(),
        },
      });

      return;
    }

    const result = output.result;
    const summary = result.summary || {};

    await db.clientOnPageOptimizationRun.update({
      where: { id: runIdValue },
      data: {
        status: RUN_STATUS.COMPLETED,
        healthScore: summary.healthScore ?? null,
        healthGrade: summary.healthGrade ?? null,
        healthStatus: summary.healthStatus ?? null,
        pagesAudited: summary.pages ?? null,
        highIssues: summary.high ?? null,
        mediumIssues: summary.medium ?? null,
        lowIssues: summary.low ?? null,
        markdownPath: result.localMdPath || null,
        pdfPath: result.pdfPath || result.localPdfPath || null,
        pdfLink: result.pdfLink || null,
        driveLink: result.driveLink || null,
        summaryJson: summary,
        resultJson: result,
        rawOutput,
        failureMessage: null,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await db.clientOnPageOptimizationRun.update({
      where: { id: runIdValue },
      data: {
        status: RUN_STATUS.FAILED,
        failureMessage:
          error instanceof Error ? error.message : 'Website QA bot failed.',
        completedAt: new Date(),
      },
    });
  }
}

async function createRun({ db, clientId, actorRole, actorUserId, payload }) {
  const clientIdValue = toBigIntId(clientId, 'client id');
  const client = await assertClientAccess({
    db,
    clientId: clientIdValue,
    actorRole,
    actorUserId,
  });
  const websiteUrl = readRequestedWebsiteUrl({ client, payload });
  const sitemapUrl = readRequestedSitemapUrl(payload);
  const activeRun = await db.clientOnPageOptimizationRun.findFirst({
    where: {
      clientId: clientIdValue,
      status: { in: ACTIVE_RUN_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeRun) {
    throw new AppError(
      409,
      'ACTIVE_RUN_EXISTS',
      'An on-page optimization run is already in progress for this client.',
    );
  }

  assertBotExists();

  const run = await db.clientOnPageOptimizationRun.create({
    data: {
      clientId: clientIdValue,
      websiteUrl,
      sitemapUrl,
      status: RUN_STATUS.QUEUED,
      createdBy: BigInt(actorUserId),
    },
  });

  await db.client.update({
    where: { id: clientIdValue },
    data: {
      onPageOptimizationSitemapUrl: sitemapUrl,
    },
  });

  setImmediate(() => {
    executeRun({
      db,
      runId: run.id.toString(),
      clientName: client.clientName || client.businessName || `Client ${client.id}`,
      websiteUrl,
    }).catch((error) => {
      console.error('[on-page-optimization] run failed', error);
    });
  });

  return serializeRun(run);
}

async function deleteRun({ db, clientId, runId, actorRole, actorUserId }) {
  const run = await assertRunAccess({
    db,
    clientId,
    runId,
    actorRole,
    actorUserId,
  });

  await db.clientOnPageOptimizationRun.delete({
    where: { id: run.id },
  });
}

async function listPageActivity({
  before,
  db,
  clientId,
  runId,
  actorRole,
  actorUserId,
  pageUrl,
  limit = 50,
}) {
  const run = await assertRunAccess({
    db,
    clientId,
    runId,
    actorRole,
    actorUserId,
  });
  const normalizedPageUrl = readPageUrl(pageUrl);
  const parsedLimit = Number(limit);
  const safeLimit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 50;
  let beforeDate = null;

  if (before) {
    beforeDate = new Date(before);

    if (Number.isNaN(beforeDate.getTime())) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'before must be a valid ISO date.',
      );
    }
  }

  const activities = await db.clientOnPageOptimizationPageActivity.findMany({
    where: {
      runId: run.id,
      pageUrl: normalizedPageUrl,
      ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit + 1,
  });
  const userIds = Array.from(
    new Set(
      activities
        .map((activity) => activity.actorUserId)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: {
          id: {
            in: userIds.map((id) => BigInt(id)),
          },
        },
        select: {
          avatarUrl: true,
          email: true,
          firstName: true,
          id: true,
          lastName: true,
        },
      })
    : [];
  const usersById = new Map(users.map((user) => [String(user.id), user]));
  const items = activities
    .slice(0, safeLimit)
    .map((activity) => serializePageActivity(activity, usersById));
  const oldest = items[items.length - 1];

  return {
    items,
    cursor:
      activities.length > safeLimit && oldest
        ? new Date(oldest.createdAt).toISOString()
        : null,
  };
}

async function createPageComment({
  db,
  clientId,
  runId,
  actorRole,
  actorUserId,
  payload,
}) {
  const run = await assertRunAccess({
    db,
    clientId,
    runId,
    actorRole,
    actorUserId,
  });
  const pageUrl = readPageUrl(payload.pageUrl);
  let bodyJson = null;

  if (payload.bodyJson !== undefined) {
    try {
      bodyJson = validateDescriptionJson(payload.bodyJson);
    } catch (err) {
      throw new AppError(400, 'VALIDATION_ERROR', err.message);
    }
  }

  const text =
    bodyJson !== null
      ? proseMirrorToPlainText(bodyJson)
      : String(payload.comment || '').trim();

  if (!text) {
    throw new AppError(400, 'VALIDATION_ERROR', 'comment is required.');
  }

  const created = await db.clientOnPageOptimizationPageActivity.create({
    data: {
      actorUserId: BigInt(actorUserId),
      bodyJson: bodyJson ?? undefined,
      comment: text,
      kind: 'COMMENT',
      pageUrl,
      runId: run.id,
    },
  });
  const users = await db.user.findMany({
    where: { id: BigInt(actorUserId) },
    select: {
      avatarUrl: true,
      email: true,
      firstName: true,
      id: true,
      lastName: true,
    },
  });

  return serializePageActivity(
    created,
    new Map(users.map((user) => [String(user.id), user])),
  );
}

async function deletePageComment({
  db,
  clientId,
  runId,
  actorRole,
  actorUserId,
  activityId,
}) {
  const run = await assertRunAccess({
    db,
    clientId,
    runId,
    actorRole,
    actorUserId,
  });
  const activityIdValue = toBigIntId(activityId, 'activity id');
  const existing = await db.clientOnPageOptimizationPageActivity.findFirst({
    where: {
      id: activityIdValue,
      kind: 'COMMENT',
      runId: run.id,
    },
    select: {
      actorUserId: true,
      id: true,
    },
  });

  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Comment not found.');
  }

  if (String(existing.actorUserId || '') !== String(actorUserId)) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'You can only delete your own comment.',
    );
  }

  await db.clientOnPageOptimizationPageActivity.delete({
    where: { id: activityIdValue },
  });

  return { success: true };
}

async function getRunPdfPath({ db, clientId, runId, actorRole, actorUserId }) {
  const runAccess = await assertRunAccess({
    db,
    clientId,
    runId,
    actorRole,
    actorUserId,
  });
  const run = await db.clientOnPageOptimizationRun.findUnique({
    where: { id: runAccess.id },
    include: {
      client: {
        select: {
          id: true,
          clientName: true,
          businessName: true,
          website: true,
        },
      },
    },
  });

  if (!run) {
    throw new AppError(404, 'NOT_FOUND', 'On-page optimization run not found.');
  }

  const hasCurrentPdfVersion =
    run.resultJson?.reportGeneration?.version === PDF_REPORT_VERSION;

  if (run.pdfPath && hasCurrentPdfVersion) {
    const resolvedPath = assertBotReportsPath(run.pdfPath);

    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  if (run.status !== RUN_STATUS.COMPLETED) {
    throw new AppError(404, 'NOT_FOUND', 'PDF report is not available yet.');
  }

  const audit = run.resultJson?.audit;

  if (!audit || !Array.isArray(audit.pages)) {
    throw new AppError(404, 'NOT_FOUND', 'PDF report source data is not available.');
  }

  const { botDirectory } = assertBotExists();
  configurePdfChromeExecutable();
  const { generatePdf } = require(path.join(botDirectory, 'lib', 'report'));
  const clientName = run.client.clientName || run.client.businessName || `Client ${run.client.id}`;
  const reportClient = {
    ...(audit.client || {}),
    name: audit.client?.name || clientName,
    url: audit.client?.url || run.websiteUrl || run.client.website || '',
    status: audit.client?.status || 'AHM On-Page Optimization',
  };
  const baseReportAudit = stripOmittedScreenshots({
    ...audit,
    client: reportClient,
    runAt: audit.runAt || run.completedAt?.toISOString() || run.createdAt.toISOString(),
  });
  const reportAudit = await enrichAuditWithAiNarrative({
    audit: baseReportAudit,
    botDirectory,
    client: reportClient,
  });
  const { pdf } = await generatePdf(reportClient, reportAudit);
  const date = new Date().toISOString().slice(0, 10);
  const reportDir = path.join(botDirectory, 'reports', date);
  const pdfPath = path.join(reportDir, `${safeReportName(clientName)}.pdf`);
  const nextResultJson = {
    ...(run.resultJson || {}),
    audit: reportAudit,
    reportGeneration: {
      generatedAt: new Date().toISOString(),
      narrativeGenerated: Boolean(reportAudit.narrative),
      source: 'saved-scan-result',
      version: PDF_REPORT_VERSION,
    },
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(pdfPath, pdf);

  await db.clientOnPageOptimizationRun.update({
    where: { id: run.id },
    data: {
      pdfPath,
      resultJson: nextResultJson,
    },
  });

  return assertBotReportsPath(pdfPath);
}

async function fetchExportImageResponse(imageUrl, redirects = 0) {
  await assertPublicUrl(imageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBP_EXPORT_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl.toString(), {
      headers: {
        Accept: 'image/jpeg,image/png,image/*;q=0.8',
        'User-Agent': WEBP_EXPORT_USER_AGENT,
      },
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirects >= 3) {
        throw new Error('Image has too many redirects.');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Image redirects with HTTP ${response.status} but has no location.`);
      }

      return fetchExportImageResponse(new URL(location, imageUrl), redirects + 1);
    }

    if (!response.ok) {
      throw new Error(`Image fetch failed with HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/image\/(jpeg|jpg|png)/i.test(contentType)) {
      throw new Error('Only JPG and PNG images can be exported.');
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > WEBP_EXPORT_MAX_IMAGE_BYTES) {
      throw new Error('Image is too large to export.');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > WEBP_EXPORT_MAX_IMAGE_BYTES) {
      throw new Error('Image is too large to export.');
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExportImageBuffer(imageUrl) {
  return fetchExportImageResponse(imageUrl);
}

async function createWebpExport({ db, clientId, actorRole, actorUserId, payload }) {
  const clientIdValue = toBigIntId(clientId, 'client id');
  const client = await assertClientAccess({
    db,
    clientId: clientIdValue,
    actorRole,
    actorUserId,
  });
  const images = Array.isArray(payload?.images) ? payload.images : [];

  if (!images.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one image is required.');
  }

  if (images.length > WEBP_EXPORT_MAX_IMAGES) {
    throw new AppError(400, 'VALIDATION_ERROR', `A maximum of ${WEBP_EXPORT_MAX_IMAGES} images can be exported at once.`);
  }

  const zip = new JSZip();
  const usedNames = new Map();
  const failed = [];
  let successful = 0;

  for (const image of images) {
    const src = String(image?.src || '').trim();

    try {
      const parsedUrl = parseExportImageUrl(src);
      const extension = path.extname(parsedUrl.pathname).replace('.', '').toLowerCase();

      if (!['jpg', 'jpeg', 'png'].includes(extension)) {
        throw new Error('Only JPG and PNG images can be exported.');
      }

      const inputBuffer = await fetchExportImageBuffer(parsedUrl);
      const outputBuffer = await sharp(inputBuffer)
        .rotate()
        .webp({ quality: 82 })
        .toBuffer();
      const filename = uniqueWebpFilename({ ...image, src }, usedNames);

      zip.file(filename, outputBuffer);
      successful += 1;
    } catch (error) {
      failed.push({
        src,
        reason: error instanceof Error ? error.message : 'Image conversion failed.',
      });
    }
  }

  if (!successful) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No selected images could be converted.', {
      failed,
      selected: images.length,
      skipped: 0,
      successful,
    });
  }

  const zipBuffer = await zip.generateAsync({
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    type: 'nodebuffer',
  });
  const today = new Date().toISOString().slice(0, 10);

  return {
    buffer: zipBuffer,
    filename: `${safeZipClientName(client)}-webp-optimization-${today}.zip`,
    summary: {
      failed,
      selected: images.length,
      skipped: 0,
      successful,
    },
  };
}

module.exports = {
  createPageComment,
  createRun,
  createWebpExport,
  deletePageComment,
  deleteRun,
  getSettings,
  getRun,
  getRunPdfPath,
  listPageActivity,
  listRuns,
  updateSettings,
};
