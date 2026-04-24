const scansService = require('./scans.service');
const { AppError } = require('../../lib/errors');
const { writeAuditLog } = require('../../lib/audit-log');

function readScanId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid scan id.');
  }
  return id;
}

function readRunId(req) {
  const id = Number(req.params.runId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid scan run id.');
  }
  return id;
}

function readClientId(req) {
  const id = Number(req.params.clientId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid client id.');
  }
  return id;
}

async function createScan(req, res, next) {
  try {
    const scans = await scansService.createScan({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });
    const runNow = req.body?.runNow === true || req.body?.runNow === 'true' || req.body?.runNow === 1 || req.body?.runNow === '1';
    let runs = [];

    if (runNow) {
      runs = await Promise.all(
        scans.map((scan) => scansService.startScanRun({
          db: req.app.locals.db,
          actorUserId: req.auth.userId,
          scanId: scan.id
        }))
      );

      for (let index = 0; index < scans.length; index += 1) {
        const scan = scans[index];
        const run = runs[index];
        setImmediate(() => {
          scansService.executeScanRun({
            db: req.app.locals.db,
            env: req.app.locals.env,
            actorUserId: req.auth.userId,
            scanId: scan.id,
            runId: run.id,
            io: req.app.locals.io
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('Scan execution failed:', err);
          });
        });
      }
    }

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: runNow ? 'LOCAL_RANK_SCAN_CREATED_AND_STARTED' : 'LOCAL_RANK_SCAN_CREATED',
      resourceType: 'scan',
      resourceId: scans[0]?.id ?? null,
      metadata: {
        totalScans: scans.length,
        runNow
      }
    });

    res.status(201).json({
      scan: scans[0] || null,
      scans,
      run: runs[0] || null,
      runs,
      total: scans.length
    });
  } catch (err) {
    next(err);
  }
}

async function listScans(req, res, next) {
  try {
    const data = await scansService.listScans({
      db: req.app.locals.db,
      clientId: req.query.clientId,
      scope: req.query.scope,
      view: req.query.view,
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getQuickGbpPreview(req, res, next) {
  try {
    const data = await scansService.getQuickGbpPreview({
      db: req.app.locals.db,
      env: req.app.locals.env,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listClientLocalRankings(req, res, next) {
  try {
    const data = await scansService.listClientLocalRankings({
      db: req.app.locals.db,
      clientId: readClientId(req),
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getSavedLocalRankingKeywords(req, res, next) {
  try {
    const data = await scansService.getSavedLocalRankingKeywords({
      db: req.app.locals.db,
      clientId: readClientId(req),
      actorUserId: req.auth.userId
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function saveLocalRankingKeywords(req, res, next) {
  try {
    const data = await scansService.saveLocalRankingKeywords({
      db: req.app.locals.db,
      clientId: readClientId(req),
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function clearSavedLocalRankingKeywords(req, res, next) {
  try {
    const data = await scansService.clearSavedLocalRankingKeywords({
      db: req.app.locals.db,
      clientId: readClientId(req),
      actorUserId: req.auth.userId
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getScanById(req, res, next) {
  try {
    const scan = await scansService.getScanById({
      db: req.app.locals.db,
      scanId: readScanId(req)
    });
    res.status(200).json({ scan });
  } catch (err) {
    next(err);
  }
}

async function getClientScanById(req, res, next) {
  try {
    const scan = await scansService.getClientScanById({
      db: req.app.locals.db,
      clientId: readClientId(req),
      scanId: readScanId(req)
    });
    res.status(200).json({ scan });
  } catch (err) {
    next(err);
  }
}

async function getClientScanComparison(req, res, next) {
  try {
    const data = await scansService.getClientScanComparison({
      db: req.app.locals.db,
      clientId: readClientId(req),
      scanId: readScanId(req),
      limit: req.query.limit
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteScanKeyword(req, res, next) {
  try {
    const result = await scansService.deleteScanKeyword({
      db: req.app.locals.db,
      scanId: readScanId(req),
      keyword: req.query.keyword ?? req.body?.keyword
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteScanById(req, res, next) {
  try {
    const result = await scansService.deleteScanById({
      db: req.app.locals.db,
      scanId: readScanId(req)
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function runScan(req, res, next) {
  try {
    const scanId = readScanId(req);
    const run = await scansService.startScanRun({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      scanId
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'LOCAL_RANK_SCAN_STARTED',
      resourceType: 'scan_run',
      resourceId: run.id,
      metadata: {
        scanId
      }
    });

    res.status(202).json({
      run,
      message: 'Scan run queued.'
    });

    setImmediate(() => {
      scansService.executeScanRun({
        db: req.app.locals.db,
        env: req.app.locals.env,
        actorUserId: req.auth.userId,
        scanId,
        runId: run.id,
        io: req.app.locals.io
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Scan execution failed:', err);
      });
    });
  } catch (err) {
    next(err);
  }
}

async function listScanRuns(req, res, next) {
  try {
    const data = await scansService.listScanRuns({
      db: req.app.locals.db,
      scanId: readScanId(req),
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getScanRunById(req, res, next) {
  try {
    const run = await scansService.getScanRunById({
      db: req.app.locals.db,
      scanId: readScanId(req),
      runId: readRunId(req)
    });
    res.status(200).json({ run });
  } catch (err) {
    next(err);
  }
}

async function listScanRunKeywordSummary(req, res, next) {
  try {
    const data = await scansService.listScanRunKeywordSummary({
      db: req.app.locals.db,
      scanId: readScanId(req),
      runId: readRunId(req),
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getScanRunKeywordDetails(req, res, next) {
  try {
    const data = await scansService.getScanRunKeywordDetails({
      db: req.app.locals.db,
      scanId: readScanId(req),
      runId: readRunId(req)
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getQuickGbpPreview,
  createScan,
  listScans,
  listClientLocalRankings,
  getSavedLocalRankingKeywords,
  saveLocalRankingKeywords,
  clearSavedLocalRankingKeywords,
  getScanById,
  getClientScanById,
  getClientScanComparison,
  deleteScanById,
  deleteScanKeyword,
  runScan,
  listScanRuns,
  getScanRunById,
  listScanRunKeywordSummary,
  getScanRunKeywordDetails
};
