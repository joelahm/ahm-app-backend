const express = require('express');

const websiteContentReviewsController = require('./website-content-reviews.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const {
  uploadWebsiteContentFeaturedImage,
  handleWebsiteContentFeaturedImageUploadError,
} = require('../../middleware/uploadWebsiteContentFeaturedImage');

const router = express.Router();

router.get('/public/:token/status', websiteContentReviewsController.publicStatus);
router.post('/public/:token/otp', websiteContentReviewsController.sendOtp);
router.post('/public/:token/verify', websiteContentReviewsController.verifyOtp);
router.get('/public/:token/content', websiteContentReviewsController.getPublicContent);
router.post(
  '/public/:token/featured-image',
  uploadWebsiteContentFeaturedImage.single('featuredImage'),
  handleWebsiteContentFeaturedImageUploadError,
  websiteContentReviewsController.uploadPublicFeaturedImage,
);
router.patch('/public/:token/content', websiteContentReviewsController.savePublicContent);
router.post('/public/:token/comments', websiteContentReviewsController.addPublicComment);
router.delete('/public/:token/comments/:commentId', websiteContentReviewsController.deletePublicComment);

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/dashboard-state', websiteContentReviewsController.getDashboardState);
router.post('/links', websiteContentReviewsController.enableLink);
router.delete('/links', websiteContentReviewsController.disableLink);
router.post('/links/send-to-client', websiteContentReviewsController.sendLinkToClientReview);
router.post('/links/send-to-client/bulk', websiteContentReviewsController.sendBulkLinksToClientReview);
router.post('/backups', websiteContentReviewsController.createManualBackup);

module.exports = { websiteContentReviewsRouter: router };
