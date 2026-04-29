const websiteContentReviewsService = require('./website-content-reviews.service');
const path = require('path');
const { AppError } = require('../../lib/errors');

function readReviewSessionToken(req) {
  const header = req.headers['x-review-session-token'];

  return Array.isArray(header) ? header[0] : header;
}

async function getDashboardState(req, res, next) {
  try {
    const data = await websiteContentReviewsService.getDashboardState({
      db: req.app.locals.db,
      env: req.app.locals.env,
      query: req.query || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function enableLink(req, res, next) {
  try {
    const data = await websiteContentReviewsService.enableLink({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function disableLink(req, res, next) {
  try {
    const data = await websiteContentReviewsService.disableLink({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      query: req.query || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createManualBackup(req, res, next) {
  try {
    const data = await websiteContentReviewsService.createManualBackup({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      payload: req.body || {},
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function sendLinkToClientReview(req, res, next) {
  try {
    const data = await websiteContentReviewsService.sendLinkToClientReview({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function sendBulkLinksToClientReview(req, res, next) {
  try {
    const data = await websiteContentReviewsService.sendBulkLinksToClientReview({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function publicStatus(req, res, next) {
  try {
    const data = await websiteContentReviewsService.publicStatus({
      db: req.app.locals.db,
      token: req.params.token,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function sendOtp(req, res, next) {
  try {
    const data = await websiteContentReviewsService.sendOtp({
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
      token: req.params.token,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const data = await websiteContentReviewsService.verifyOtp({
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
      token: req.params.token,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getPublicContent(req, res, next) {
  try {
    const data = await websiteContentReviewsService.getPublicContent({
      db: req.app.locals.db,
      env: req.app.locals.env,
      reviewSessionToken: readReviewSessionToken(req),
      token: req.params.token,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function savePublicContent(req, res, next) {
  try {
    const data = await websiteContentReviewsService.savePublicContent({
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
      reviewSessionToken: readReviewSessionToken(req),
      token: req.params.token,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function uploadPublicFeaturedImage(req, res, next) {
  try {
    await websiteContentReviewsService.validatePublicReviewSession({
      db: req.app.locals.db,
      env: req.app.locals.env,
      reviewSessionToken: readReviewSessionToken(req),
      token: req.params.token,
    });

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

async function addPublicComment(req, res, next) {
  try {
    const data = await websiteContentReviewsService.addPublicComment({
      db: req.app.locals.db,
      env: req.app.locals.env,
      payload: req.body || {},
      reviewSessionToken: readReviewSessionToken(req),
      token: req.params.token,
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function deletePublicComment(req, res, next) {
  try {
    const data = await websiteContentReviewsService.deletePublicComment({
      commentId: req.params.commentId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      reviewSessionToken: readReviewSessionToken(req),
      token: req.params.token,
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  addPublicComment,
  createManualBackup,
  deletePublicComment,
  disableLink,
  enableLink,
  getDashboardState,
  getPublicContent,
  publicStatus,
  savePublicContent,
  uploadPublicFeaturedImage,
  sendBulkLinksToClientReview,
  sendLinkToClientReview,
  sendOtp,
  verifyOtp,
};
