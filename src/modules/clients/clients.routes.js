const express = require('express');
const clientsController = require('./clients.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const { uploadClientAssets, handleClientAssetsUploadError } = require('../../middleware/uploadClientAssets');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/', clientsController.listClients);
router.get('/:id', clientsController.getClientById);
router.get('/:id/gbp-details', clientsController.getClientGbpDetails);
router.get('/:id/citations', clientsController.listClientCitations);
router.get('/:id/projects', clientsController.listClientProjects);
router.post('/', clientsController.createClient);
router.post('/:id/citations', clientsController.createClientCitation);
router.patch('/:id', uploadClientAssets.any(), handleClientAssetsUploadError, clientsController.patchClient);
router.patch('/:id/citations/:citationId', clientsController.patchClientCitation);
router.delete('/:id/citations/:citationId', clientsController.deleteClientCitation);
router.post('/:id/projects', clientsController.createClientProject);

module.exports = { clientsRouter: router };
