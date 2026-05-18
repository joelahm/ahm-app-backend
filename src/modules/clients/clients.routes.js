const express = require('express');
const clientsController = require('./clients.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireAnyPermission, requirePermission } = require('../../middleware/requirePermission');
const { uploadClientAssets, handleClientAssetsUploadError } = require('../../middleware/uploadClientAssets');
const { uploadGbpPostingImage, handleGbpPostingImageUploadError } = require('../../middleware/uploadGbpPostingImage');
const { uploadWebsiteContentLayout, handleWebsiteContentLayoutUploadError } = require('../../middleware/uploadWebsiteContentLayout');
const { uploadCitationAttachment, handleCitationAttachmentUploadError } = require('../../middleware/uploadCitationAttachment');

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
// Service scopes non-admins to clients they're connected to
// (assigned, or CSM/AM/task-assignee of any of the client's projects).
router.get('/:id', clientsController.getClientById);
router.get('/:id/gbp-details', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientGbpDetails);
router.get('/:id/reviews', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.getClientGbpReviews);
router.put('/:id/reviews/:reviewId/draft', requirePermission('reply-to-reviews'), clientsController.saveClientReviewReplyDraft);
router.get('/:id/gbp-postings', requirePermission('view-posts'), clientsController.listClientGbpPostings);
router.post('/:id/gbp-postings', requirePermission('create-draft-posts'), clientsController.createClientGbpPostings);
router.post('/:id/gbp-postings/generate-from-keywords', requirePermission('create-draft-posts'), clientsController.generateClientGbpPostings);
router.post('/:id/gbp-postings/:postingId/generate-content', requirePermission('create-draft-posts'), clientsController.generateClientGbpPostingContent);
router.patch('/:id/gbp-postings/:postingId', requirePermission('create-draft-posts'), clientsController.patchClientGbpPosting);
router.delete('/:id/gbp-postings/:postingId', requirePermission('create-draft-posts'), clientsController.deleteClientGbpPosting);
router.post(
  '/:id/gbp-postings/:postingId/images',
  requirePermission('create-draft-posts'),
  uploadGbpPostingImage.single('image'),
  handleGbpPostingImageUploadError,
  clientsController.uploadClientGbpPostingImage,
);
router.post(
  '/:id/website-content-layouts',
  requirePermission('edit-location-details'),
  uploadWebsiteContentLayout.single('layout'),
  handleWebsiteContentLayoutUploadError,
  clientsController.uploadWebsiteContentLayout,
);
router.get('/:id/gbp-postings/:postingId/comments', requirePermission('view-posts'), clientsController.listClientGbpPostingComments);
router.post('/:id/gbp-postings/:postingId/comments', requirePermission('create-draft-posts'), clientsController.createClientGbpPostingComment);
router.delete('/:id/gbp-postings/:postingId/comments/:commentId', requirePermission('create-draft-posts'), clientsController.deleteClientGbpPostingComment);
router.get('/:id/citations', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientCitations);
// Service scopes non-admins to projects they're connected to.
router.get('/:id/projects', clientsController.listClientProjects);
router.post('/', requirePermission('add-new-client'), clientsController.createClient);
router.delete('/:id', clientsController.deleteClient);
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
router.get('/:id/citations/:citationId/attachments', requireAnyPermission(CLIENT_READ_PERMISSIONS), clientsController.listClientCitationAttachments);
router.post(
  '/:id/citations/:citationId/attachments',
  requirePermission('edit-location-details'),
  uploadCitationAttachment.single('file'),
  handleCitationAttachmentUploadError,
  clientsController.uploadClientCitationAttachment,
);
router.delete(
  '/:id/citations/:citationId/attachments/:attachmentId',
  requirePermission('edit-location-details'),
  clientsController.deleteClientCitationAttachment,
);
router.delete('/:id/citations/:citationId', requirePermission('remove-client'), clientsController.deleteClientCitation);
router.post('/:id/projects', requirePermission('add-new-client'), clientsController.createClientProject);
router.patch('/:id/projects/:projectId', requirePermission('edit-location-details'), clientsController.patchClientProject);
router.delete('/:id/projects/:projectId', requirePermission('remove-client'), clientsController.deleteClientProject);

module.exports = { clientsRouter: router };
