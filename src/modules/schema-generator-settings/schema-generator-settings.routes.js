const express = require('express');
const schemaGeneratorSettingsController = require('./schema-generator-settings.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);

router.get('/types', schemaGeneratorSettingsController.listSchemaTypes);
router.put('/types', requireRole('ADMIN'), schemaGeneratorSettingsController.updateSchemaTypes);
router.get('/medical-specialties', schemaGeneratorSettingsController.listMedicalSpecialties);
router.put(
  '/medical-specialties',
  requireRole('ADMIN'),
  schemaGeneratorSettingsController.updateMedicalSpecialties
);
router.get('/service-types', schemaGeneratorSettingsController.listServiceTypes);
router.put(
  '/service-types',
  requireRole('ADMIN'),
  schemaGeneratorSettingsController.updateServiceTypes
);

module.exports = { schemaGeneratorSettingsRouter: router };
