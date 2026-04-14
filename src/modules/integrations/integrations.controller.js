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

async function syncDataForSeoGoogleAdsLocations(req, res, next) {
  try {
    const data = await integrationsService.syncDataForSeoGoogleAdsLocations({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      forceRefresh: Boolean(req.body?.forceRefresh),
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function syncDataForSeoGoogleAdsReferenceData(req, res, next) {
  try {
    const forceRefresh =
      Boolean(req.body?.forceRefresh) ||
      String(req.query?.forceRefresh || '').trim().toLowerCase() === 'true' ||
      String(req.query?.forceRefresh || '').trim() === '1';

    const data = await integrationsService.syncDataForSeoGoogleAdsReferenceData({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth?.userId ?? null,
      forceRefresh,
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listDataForSeoKeywordLanguages(req, res, next) {
  try {
    const data = await integrationsService.listDataForSeoKeywordLanguages({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listDataForSeoKeywordCountries(req, res, next) {
  try {
    const data = await integrationsService.listDataForSeoKeywordCountries({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listDataForSeoKeywordRegions(req, res, next) {
  try {
    const data = await integrationsService.listDataForSeoKeywordRegions({
      db: req.app.locals.db,
      env: req.app.locals.env,
      requestedBy: req.auth.userId,
      payload: req.query || {},
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function dataForSeoSimilarKeywords(req, res, next) {
  try {
    const data = await integrationsService.fetchDataForSeoSimilarKeywords({
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

async function dataForSeoKeywordSuggestions(req, res, next) {
  try {
    const data = await integrationsService.fetchDataForSeoKeywordSuggestions({
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

async function dataForSeoKeywordOverview(req, res, next) {
  try {
    const data = await integrationsService.fetchDataForSeoKeywordOverview({
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

async function manusGenerateText(req, res, next) {
  try {
    const data = await integrationsService.fetchManusGeneratedText({
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
  syncDataForSeoGoogleAdsReferenceData,
  syncDataForSeoGoogleAdsLocations,
  listDataForSeoKeywordLanguages,
  listDataForSeoKeywordCountries,
  listDataForSeoKeywordRegions,
  dataForSeoSimilarKeywords,
  dataForSeoKeywordSuggestions,
  dataForSeoKeywordOverview,
  serpApiGbpDetails,
  serpApiReviews,
  manusGenerateText
};
