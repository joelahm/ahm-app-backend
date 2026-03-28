const integrationsService = require('./integrations.service');

async function dataForSeoRankings(req, res, next) {
  try {
    const data = await integrationsService.fetchDataForSeoRankings({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function dataForSeoMapsCompetitors(req, res, next) {
  try {
    const data = await integrationsService.fetchDataForSeoMapsCompetitors({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function dataForSeoGbpPosts(req, res, next) {
  try {
    const data = await integrationsService.fetchDataForSeoGbpPosts({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function serpApiGbpDetails(req, res, next) {
  try {
    const data = await integrationsService.fetchSerpApiGbpDetails({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function serpApiReviews(req, res, next) {
  try {
    const data = await integrationsService.fetchSerpApiReviews({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      payload: req.body || {}
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dataForSeoRankings,
  dataForSeoMapsCompetitors,
  dataForSeoGbpPosts,
  serpApiGbpDetails,
  serpApiReviews
};
