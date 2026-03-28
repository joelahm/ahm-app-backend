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
router.post('/serpapi/gbp-details', integrationsController.serpApiGbpDetails);
router.post('/serpapi/reviews', integrationsController.serpApiReviews);

module.exports = { integrationsRouter: router };
