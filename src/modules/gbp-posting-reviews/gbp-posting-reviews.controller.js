const gbpPostingReviewsService = require('./gbp-posting-reviews.service');

function readReviewSessionToken(req) {
  const header = req.headers['x-review-session-token'];

  return Array.isArray(header) ? header[0] : header;
}

async function getDashboardState(req, res, next) {
  try {
    const data = await gbpPostingReviewsService.getDashboardState({
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
    const data = await gbpPostingReviewsService.enableLink({
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
    const data = await gbpPostingReviewsService.disableLink({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      query: req.query || {},
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function sendLinkToClientReview(req, res, next) {
  try {
    const data = await gbpPostingReviewsService.sendLinkToClientReview({
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
    const data = await gbpPostingReviewsService.publicStatus({
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
    const data = await gbpPostingReviewsService.sendOtp({
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
    const data = await gbpPostingReviewsService.verifyOtp({
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
    const data = await gbpPostingReviewsService.getPublicContent({
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
    const data = await gbpPostingReviewsService.savePublicContent({
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

async function addPublicComment(req, res, next) {
  try {
    const data = await gbpPostingReviewsService.addPublicComment({
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
    const data = await gbpPostingReviewsService.deletePublicComment({
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
  deletePublicComment,
  disableLink,
  enableLink,
  getDashboardState,
  getPublicContent,
  publicStatus,
  savePublicContent,
  sendLinkToClientReview,
  sendOtp,
  verifyOtp,
};
