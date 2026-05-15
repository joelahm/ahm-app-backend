const express = require('express');

const gbpPostingReviewsController = require('./gbp-posting-reviews.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const {
  uploadGbpPostingImage,
  handleGbpPostingImageUploadError,
} = require('../../middleware/uploadGbpPostingImage');

const router = express.Router();

router.get('/public/:token/status', gbpPostingReviewsController.publicStatus);
router.post('/public/:token/otp', gbpPostingReviewsController.sendOtp);
router.post('/public/:token/verify', gbpPostingReviewsController.verifyOtp);
router.get('/public/:token/content', gbpPostingReviewsController.getPublicContent);
router.patch('/public/:token/content', gbpPostingReviewsController.savePublicContent);
router.post(
  '/public/:token/images',
  uploadGbpPostingImage.single('image'),
  handleGbpPostingImageUploadError,
  gbpPostingReviewsController.uploadPublicImage,
);
router.post('/public/:token/comments', gbpPostingReviewsController.addPublicComment);
router.delete('/public/:token/comments/:commentId', gbpPostingReviewsController.deletePublicComment);

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/dashboard-state', gbpPostingReviewsController.getDashboardState);
router.post('/links', gbpPostingReviewsController.enableLink);
router.delete('/links', gbpPostingReviewsController.disableLink);
router.post('/links/send-to-client', gbpPostingReviewsController.sendLinkToClientReview);

module.exports = { gbpPostingReviewsRouter: router };
