const express = require('express');
const keywordContentListsController = require('./keyword-content-lists.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/', keywordContentListsController.listKeywordContentLists);
router.post('/', keywordContentListsController.createKeywordContentList);

module.exports = { keywordContentListsRouter: router };
