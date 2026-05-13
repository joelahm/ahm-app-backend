const path = require('path');

const onPageOptimizationsService = require('./on-page-optimizations.service');

async function listRuns(req, res, next) {
  try {
    const runs = await onPageOptimizationsService.listRuns({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
    });

    res.status(200).json({
      runs,
      total: runs.length,
    });
  } catch (err) {
    next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const settings = await onPageOptimizationsService.getSettings({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
    });

    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const settings = await onPageOptimizationsService.updateSettings({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
      payload: req.body || {},
    });

    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

async function createRun(req, res, next) {
  try {
    const run = await onPageOptimizationsService.createRun({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
      payload: req.body || {},
    });

    res.status(202).json({ run });
  } catch (err) {
    next(err);
  }
}

async function createWebpExport(req, res, next) {
  try {
    const result = await onPageOptimizationsService.createWebpExport({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
      payload: req.body || {},
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('X-Webp-Export-Summary', encodeURIComponent(JSON.stringify(result.summary)));
    res.status(200).send(result.buffer);
  } catch (err) {
    next(err);
  }
}

async function getRun(req, res, next) {
  try {
    const run = await onPageOptimizationsService.getRun({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      runId: req.params.runId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
    });

    res.status(200).json({ run });
  } catch (err) {
    next(err);
  }
}

async function deleteRun(req, res, next) {
  try {
    await onPageOptimizationsService.deleteRun({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      runId: req.params.runId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listPageActivity(req, res, next) {
  try {
    const data = await onPageOptimizationsService.listPageActivity({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      runId: req.params.runId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
      pageUrl: req.query.url,
      before: req.query.before,
      limit: req.query.limit,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createPageComment(req, res, next) {
  try {
    const comment = await onPageOptimizationsService.createPageComment({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      runId: req.params.runId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
      payload: req.body || {},
    });

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

async function deletePageComment(req, res, next) {
  try {
    await onPageOptimizationsService.deletePageComment({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      runId: req.params.runId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
      activityId: req.params.activityId,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function downloadRunPdf(req, res, next) {
  try {
    const pdfPath = await onPageOptimizationsService.getRunPdfPath({
      db: req.app.locals.db,
      clientId: req.params.clientId,
      runId: req.params.runId,
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
    });

    res.download(pdfPath, path.basename(pdfPath));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPageComment,
  createRun,
  createWebpExport,
  deletePageComment,
  deleteRun,
  downloadRunPdf,
  getSettings,
  getRun,
  listPageActivity,
  listRuns,
  updateSettings,
};
