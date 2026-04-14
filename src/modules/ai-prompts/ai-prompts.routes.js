const express = require('express');
const aiPromptsController = require('./ai-prompts.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/', aiPromptsController.listPrompts);
router.post('/', aiPromptsController.createPrompt);
router.post('/next-id', aiPromptsController.reserveNextPromptId);
router.patch('/:id', aiPromptsController.updatePrompt);

module.exports = { aiPromptsRouter: router };
