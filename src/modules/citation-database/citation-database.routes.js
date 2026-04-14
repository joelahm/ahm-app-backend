const express = require('express');
const citationDatabaseController = require('./citation-database.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/', citationDatabaseController.listCitations);
router.post('/', citationDatabaseController.createCitation);
router.post('/bulk', citationDatabaseController.bulkCreateCitations);
router.patch('/:id', citationDatabaseController.updateCitation);
router.delete('/:id', citationDatabaseController.deleteCitation);

module.exports = { citationDatabaseRouter: router };
