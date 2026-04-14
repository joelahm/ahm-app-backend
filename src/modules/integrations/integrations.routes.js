const express = require('express');
const integrationsController = require('./integrations.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.post('/dataforseo/rankings', integrationsController.dataForSeoRankings);
router.post('/dataforseo/google-maps-competitors', integrationsController.dataForSeoMapsCompetitors);
router.post('/dataforseo/gbp-posts', integrationsController.dataForSeoGbpPosts);
router.post('/dataforseo/google-ads-reference/sync', integrationsController.syncDataForSeoGoogleAdsReferenceData);
router.post('/dataforseo/google-ads-locations/sync', integrationsController.syncDataForSeoGoogleAdsLocations);
router.get('/dataforseo/google-ads-languages', integrationsController.listDataForSeoKeywordLanguages);
router.get('/dataforseo/google-ads-locations/countries', integrationsController.listDataForSeoKeywordCountries);
router.get('/dataforseo/google-ads-locations/regions', integrationsController.listDataForSeoKeywordRegions);
router.post('/dataforseo/keywords/overview', integrationsController.dataForSeoKeywordOverview);
router.post('/dataforseo/keywords/similar', integrationsController.dataForSeoSimilarKeywords);
router.post('/dataforseo/keywords/suggestions', integrationsController.dataForSeoKeywordSuggestions);
router.post('/serpapi/gbp-details', integrationsController.serpApiGbpDetails);
router.post('/serpapi/reviews', integrationsController.serpApiReviews);
router.post('/manus/generate-text', integrationsController.manusGenerateText);

module.exports = { integrationsRouter: router };
