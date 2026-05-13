const express = require('express');

const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireAnyPermission, requirePermission } = require('../../middleware/requirePermission');
const onPageOptimizationsController = require('./on-page-optimizations.controller');

const router = express.Router({ mergeParams: true });

const CLIENT_READ_PERMISSIONS = [
  'add-new-client',
  'edit-location-details',
  'remove-client',
  're-sync-location',
  'view-performance-dashboard',
];

router.use(authenticateAccessToken);

router.get(
  '/',
  requireAnyPermission(CLIENT_READ_PERMISSIONS),
  onPageOptimizationsController.listRuns,
);
router.get(
  '/settings',
  requireAnyPermission(CLIENT_READ_PERMISSIONS),
  onPageOptimizationsController.getSettings,
);
router.patch(
  '/settings',
  requirePermission('edit-location-details'),
  onPageOptimizationsController.updateSettings,
);
router.post(
  '/',
  requirePermission('edit-location-details'),
  onPageOptimizationsController.createRun,
);
router.post(
  '/webp-export',
  requirePermission('edit-location-details'),
  onPageOptimizationsController.createWebpExport,
);
router.get(
  '/:runId/pages/activity',
  requireAnyPermission(CLIENT_READ_PERMISSIONS),
  onPageOptimizationsController.listPageActivity,
);
router.post(
  '/:runId/pages/activity/comments',
  requirePermission('edit-location-details'),
  onPageOptimizationsController.createPageComment,
);
router.delete(
  '/:runId/pages/activity/comments/:activityId',
  requirePermission('edit-location-details'),
  onPageOptimizationsController.deletePageComment,
);
router.get(
  '/:runId',
  requireAnyPermission(CLIENT_READ_PERMISSIONS),
  onPageOptimizationsController.getRun,
);
router.get(
  '/:runId/report/pdf',
  requireAnyPermission(CLIENT_READ_PERMISSIONS),
  onPageOptimizationsController.downloadRunPdf,
);
router.delete(
  '/:runId',
  requirePermission('edit-location-details'),
  onPageOptimizationsController.deleteRun,
);

module.exports = { onPageOptimizationsRouter: router };
