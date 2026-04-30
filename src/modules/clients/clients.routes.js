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
router.get('/discord/statuses', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientDiscordStatuses);
router.get('/:id', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientById);
router.get('/:id/gbp-details', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientGbpDetails);
router.get('/:id/reviews', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientGbpReviews);
router.put('/:id/reviews/:reviewId/draft', requirePermission('reply-to-reviews'), clientsController.saveClientReviewReplyDraft);
router.get('/:id/gbp-postings', requirePermission('view-posts'), clientsController.listClientGbpPostings);
router.post('/:id/gbp-postings', requirePermission('create-draft-posts'), clientsController.createClientGbpPostings);
router.post('/:id/gbp-postings/generate-from-keywords', requirePermission('create-draft-posts'), clientsController.generateClientGbpPostings);
router.post('/:id/gbp-postings/:postingId/generate-content', requirePermission('create-draft-posts'), clientsController.generateClientGbpPostingContent);
router.patch('/:id/gbp-postings/:postingId', requirePermission('create-draft-posts'), clientsController.patchClientGbpPosting);
router.delete('/:id/gbp-postings/:postingId', requirePermission('create-draft-posts'), clientsController.deleteClientGbpPosting);
router.get('/:id/gbp-postings/:postingId/comments', requirePermission('view-posts'), clientsController.listClientGbpPostingComments);
router.post('/:id/gbp-postings/:postingId/comments', requirePermission('create-draft-posts'), clientsController.createClientGbpPostingComment);
router.delete('/:id/gbp-postings/:postingId/comments/:commentId', requirePermission('create-draft-posts'), clientsController.deleteClientGbpPostingComment);
router.get('/:id/citations', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientCitations);
router.get('/:id/projects', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientProjects);
router.post('/', requirePermission('add-new-client'), clientsController.createClient);
router.post('/:id/discord/test', requirePermission('edit-location-details'), clientsController.testClientDiscordConnection);
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
