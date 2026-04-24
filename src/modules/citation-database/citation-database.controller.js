const citationDatabaseService = require('./citation-database.service');
const fs = require('fs/promises');
const path = require('path');

function resolveRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string' && forwardedProto
      ? forwardedProto.split(',')[0].trim()
      : req.protocol;

  return `${proto}://${req.get('host')}`;
}

function toAbsoluteCitationIconUrl(req, iconUrl) {
  if (!iconUrl) return null;
  if (/^https?:\/\//i.test(iconUrl)) return iconUrl;
  const origin = resolveRequestOrigin(req);
  return `${origin}${iconUrl.startsWith('/') ? iconUrl : `/${iconUrl}`}`;
}

function mapCitationResponse(req, citation) {
  return {
    ...citation,
    iconPath: citation.iconUrl || null,
    iconUrl: toAbsoluteCitationIconUrl(req, citation.iconUrl),
  };
}

async function listCitations(req, res, next) {
  try {
    const data = await citationDatabaseService.getCitationDatabase({
      db: req.app.locals.db,
    });

    res.status(200).json({
      citations: data.citations.map((citation) => mapCitationResponse(req, citation)),
    });
  } catch (err) {
    next(err);
  }
}

async function createCitation(req, res, next) {
  try {
    const data = await citationDatabaseService.createCitation({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: {
        ...(req.body || {}),
        iconUrl: req.file?.path
          ? `/uploads/citation-icons/${path.basename(req.file.path)}`
          : undefined,
      },
    });

    res.status(201).json({
      ...data,
      citation: mapCitationResponse(req, data.citation),
    });
  } catch (err) {
    if (req.file?.path) {
      const uploadedPath = path.resolve(req.file.path);
      fs.unlink(uploadedPath).catch(() => {});
    }
    next(err);
  }
}

async function updateCitation(req, res, next) {
  try {
    const data = await citationDatabaseService.updateCitation({
      db: req.app.locals.db,
      citationId: String(req.params.id || ''),
      payload: {
        ...(req.body || {}),
        iconUrl: req.file?.path
          ? `/uploads/citation-icons/${path.basename(req.file.path)}`
          : undefined,
      },
    });

    res.status(200).json({
      ...data,
      citation: mapCitationResponse(req, data.citation),
    });
  } catch (err) {
    if (req.file?.path) {
      const uploadedPath = path.resolve(req.file.path);
      fs.unlink(uploadedPath).catch(() => {});
    }
    next(err);
  }
}

async function deleteCitation(req, res, next) {
  try {
    const data = await citationDatabaseService.deleteCitation({
      db: req.app.locals.db,
      citationId: String(req.params.id || ''),
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function bulkCreateCitations(req, res, next) {
  try {
    const data = await citationDatabaseService.bulkCreateCitations({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {},
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  bulkCreateCitations,
  createCitation,
  deleteCitation,
  listCitations,
  updateCitation,
};
