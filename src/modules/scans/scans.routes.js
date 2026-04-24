const express = require('express');
const scansController = require('./scans.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.post('/quick/gbp-preview', scansController.getQuickGbpPreview);
router.get('/', scansController.listScans);
router.get('/client/:clientId/local-rankings', scansController.listClientLocalRankings);
router.get('/client/:clientId/local-rankings/saved-keywords', scansController.getSavedLocalRankingKeywords);
router.post('/client/:clientId/local-rankings/saved-keywords', scansController.saveLocalRankingKeywords);
router.delete('/client/:clientId/local-rankings/saved-keywords', scansController.clearSavedLocalRankingKeywords);
router.get('/client/:clientId/:id/comparison', scansController.getClientScanComparison);
router.get('/client/:clientId/:id', scansController.getClientScanById);
router.post('/', scansController.createScan);
router.get('/:id', scansController.getScanById);
router.delete('/:id', scansController.deleteScanById);
router.delete('/:id/keywords', scansController.deleteScanKeyword);
router.post('/:id/run', scansController.runScan);
router.get('/:id/runs', scansController.listScanRuns);
router.get('/:id/runs/:runId', scansController.getScanRunById);
router.get('/:id/runs/:runId/keywords', scansController.listScanRunKeywordSummary);
router.get('/:id/runs/:runId/keyword-details', scansController.getScanRunKeywordDetails);

module.exports = { scansRouter: router };
