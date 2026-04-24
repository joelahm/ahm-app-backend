const keywordContentListsService = require('./keyword-content-lists.service');

async function listKeywordContentLists(req, res, next) {
  try {
    const data = await keywordContentListsService.listKeywordContentLists({
      db: req.app.locals.db,
      query: req.query || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createKeywordContentList(req, res, next) {
  try {
    const data = await keywordContentListsService.createKeywordContentList({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      payload: req.body || {},
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateKeywordContentListKeyword(req, res, next) {
  try {
    const data = await keywordContentListsService.updateKeywordContentListKeyword({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      payload: req.body || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteKeywordContentListKeyword(req, res, next) {
  try {
    const data = await keywordContentListsService.deleteKeywordContentListKeyword({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      query: req.query || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getClientContentBreakdown(req, res, next) {
  try {
    const data = await keywordContentListsService.getClientContentBreakdown({
      db: req.app.locals.db,
      query: req.query || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function saveClientContentBreakdown(req, res, next) {
  try {
    const data = await keywordContentListsService.saveClientContentBreakdown({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      payload: req.body || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listKeywordContentLists,
  createKeywordContentList,
  updateKeywordContentListKeyword,
  deleteKeywordContentListKeyword,
  getClientContentBreakdown,
  saveClientContentBreakdown,
};
