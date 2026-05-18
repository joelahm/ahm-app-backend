const clientKeywordsService = require("./client-keywords.service");
const { AppError } = require("../../lib/errors");
const { writeAuditLog } = require("../../lib/audit-log");

function readClientId(req) {
  const id = Number(req.params.clientId);

  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid client id.");
  }

  return id;
}

async function listClientKeywords(req, res, next) {
  try {
    const clientId = readClientId(req);
    const data = await clientKeywordsService.listClientKeywords({
      db: req.app.locals.db,
      clientId,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function importClientKeywords(req, res, next) {
  try {
    const clientId = readClientId(req);
    const data = await clientKeywordsService.importClientKeywords({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      clientId,
      payload: req.body || {},
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: "CLIENT_KEYWORDS_IMPORTED",
      resourceType: "client",
      resourceId: clientId,
      metadata: {
        count: Array.isArray(req.body?.keywords) ? req.body.keywords.length : 0,
      },
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteClientKeywords(req, res, next) {
  try {
    const clientId = readClientId(req);
    const keywordIds =
      req.params.keywordId !== undefined
        ? [req.params.keywordId]
        : req.body?.keywordIds;
    const data = await clientKeywordsService.deleteClientKeywords({
      db: req.app.locals.db,
      clientId,
      keywordIds,
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: "CLIENT_KEYWORDS_DELETED",
      resourceType: "client",
      resourceId: clientId,
      metadata: {
        keywordIds,
      },
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function bulkUpdateClientKeywords(req, res, next) {
  try {
    const clientId = readClientId(req);
    const body = req.body || {};
    const data = await clientKeywordsService.bulkUpdateClientKeywords({
      db: req.app.locals.db,
      clientId,
      keywordIds: body.keywordIds,
      patch: body.patch,
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: "CLIENT_KEYWORDS_BULK_UPDATED",
      resourceType: "client",
      resourceId: clientId,
      metadata: {
        keywordIds: body.keywordIds,
        patch: body.patch,
      },
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function generateClientKeywordTitles(req, res, next) {
  try {
    const clientId = readClientId(req);
    const body = req.body || {};
    const data = await clientKeywordsService.generateClientKeywordTitles({
      db: req.app.locals.db,
      env: req.app.locals.env,
      io: req.app.locals.io,
      requestedBy: req.auth.userId,
      clientId,
      keywordIds: body.keywordIds,
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: "CLIENT_KEYWORDS_TITLES_GENERATED",
      resourceType: "client",
      resourceId: clientId,
      metadata: {
        keywordIds: body.keywordIds,
      },
    });

    res.status(202).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateClientKeyword(req, res, next) {
  try {
    const clientId = readClientId(req);
    const keywordId = String(req.params.keywordId || "").trim();
    const data = await clientKeywordsService.updateClientKeyword({
      db: req.app.locals.db,
      clientId,
      keywordId,
      payload: req.body || {},
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: "CLIENT_KEYWORD_UPDATED",
      resourceType: "client",
      resourceId: clientId,
      metadata: {
        keywordId,
      },
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  bulkUpdateClientKeywords,
  deleteClientKeywords,
  generateClientKeywordTitles,
  importClientKeywords,
  listClientKeywords,
  updateClientKeyword,
};
