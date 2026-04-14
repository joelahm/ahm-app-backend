const express = require('express');
const projectTemplatesController = require('./project-templates.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.get('/status-options', projectTemplatesController.listProjectTemplateStatusOptions);

router.use(requireRole('ADMIN'));

router.get('/', projectTemplatesController.listProjectTemplates);
router.post('/', projectTemplatesController.createProjectTemplate);
router.patch('/:id', projectTemplatesController.updateProjectTemplate);
router.delete('/:id', projectTemplatesController.deleteProjectTemplate);

module.exports = { projectTemplatesRouter: router };
