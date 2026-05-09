const express = require('express');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const urlPreviewController = require('./url-preview.controller');

const router = express.Router();

router.use(authenticateAccessToken);

router.get('/', urlPreviewController.getUrlPreview);

module.exports = { urlPreviewRouter: router };
