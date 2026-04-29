const express = require('express');
const keywordContentListsController = require('./keyword-content-lists.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const {
  uploadWebsiteContentFeaturedImage,
  handleWebsiteContentFeaturedImageUploadError,
} = require('../../middleware/uploadWebsiteContentFeaturedImage');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/', keywordContentListsController.listKeywordContentLists);
router.post('/', keywordContentListsController.createKeywordContentList);
router.post(
  '/featured-image',
  uploadWebsiteContentFeaturedImage.single('featuredImage'),
  handleWebsiteContentFeaturedImageUploadError,
  keywordContentListsController.uploadFeaturedImage,
);
router.patch('/keywords', keywordContentListsController.updateKeywordContentListKeyword);
router.delete('/keywords', keywordContentListsController.deleteKeywordContentListKeyword);
router.get('/breakdown', keywordContentListsController.getClientContentBreakdown);
router.put('/breakdown', keywordContentListsController.saveClientContentBreakdown);

module.exports = { keywordContentListsRouter: router };
