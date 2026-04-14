const express = require('express');
const clientsController = require('./clients.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireAnyPermission, requirePermission } = require('../../middleware/requirePermission');
const { uploadClientAssets, handleClientAssetsUploadError } = require('../../middleware/uploadClientAssets');

const router = express.Router();

router.use(authenticateAccessToken);

const CLIENT_READ_PERMISSIONS = [
  'add-new-client',
  'edit-location-details',
  'remove-client',
  're-sync-location',
  'view-performance-dashboard'
];

router.get('/', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClients);
router.get('/:id', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientById);
router.get('/:id/gbp-details', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientGbpDetails);
router.get('/:id/citations', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientCitations);
router.get('/:id/projects', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientProjects);
router.post('/', requirePermission('add-new-client'), clientsController.createClient);
router.post('/:id/citations', requirePermission('edit-location-details'), clientsController.createClientCitation);
router.patch(
  '/:id',
  requirePermission('edit-location-details'),
  uploadClientAssets.any(),
  handleClientAssetsUploadError,
  clientsController.patchClient
);
router.patch('/:id/citations/:citationId', requirePermission('edit-location-details'), clientsController.patchClientCitation);
router.delete('/:id/citations/:citationId', requirePermission('remove-client'), clientsController.deleteClientCitation);
router.post('/:id/projects', requirePermission('add-new-client'), clientsController.createClientProject);
router.patch('/:id/projects/:projectId', requirePermission('edit-location-details'), clientsController.patchClientProject);
router.delete('/:id/projects/:projectId', requirePermission('remove-client'), clientsController.deleteClientProject);

module.exports = { clientsRouter: router };
