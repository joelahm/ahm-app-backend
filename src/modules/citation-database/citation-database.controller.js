const citationDatabaseService = require('./citation-database.service');

async function listCitations(req, res, next) {
  try {
    const data = await citationDatabaseService.getCitationDatabase({
      db: req.app.locals.db,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createCitation(req, res, next) {
  try {
    const data = await citationDatabaseService.createCitation({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {},
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateCitation(req, res, next) {
  try {
    const data = await citationDatabaseService.updateCitation({
      db: req.app.locals.db,
      citationId: String(req.params.id || ''),
      payload: req.body || {},
    });

    res.status(200).json(data);
  } catch (err) {
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
