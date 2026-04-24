const express = require('express');
const citationDatabaseController = require('./citation-database.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const {
  uploadCitationIcon,
  handleCitationIconUploadError,
} = require('../../middleware/uploadCitationIcon');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/', citationDatabaseController.listCitations);
router.post(
  '/',
  uploadCitationIcon.single('icon'),
  handleCitationIconUploadError,
  citationDatabaseController.createCitation,
);
router.post('/bulk', citationDatabaseController.bulkCreateCitations);
router.patch(
  '/:id',
  uploadCitationIcon.single('icon'),
  handleCitationIconUploadError,
  citationDatabaseController.updateCitation,
);
router.delete('/:id', citationDatabaseController.deleteCitation);

module.exports = { citationDatabaseRouter: router };
