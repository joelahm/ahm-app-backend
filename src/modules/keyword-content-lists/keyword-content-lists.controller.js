const keywordContentListsService = require('./keyword-content-lists.service');
const path = require('path');
const { AppError } = require('../../lib/errors');

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

async function uploadFeaturedImage(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Featured image is required.');
    }

    const url = `/uploads/website-content/${path.basename(req.file.path)}`;
    const origin = `${req.protocol}://${req.get('host')}`;

    res.status(201).json({
      featuredImage: {
        mimeType: req.file.mimetype,
        name: req.file.originalname,
        size: req.file.size,
        sizeLabel:
          req.file.size < 1024 * 1024
            ? `${Math.max(req.file.size / 1024, 1).toFixed(0)} KB`
            : `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`,
        url,
        previewUrl: `${origin}${url}`,
      },
    });
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
  uploadFeaturedImage,
};
