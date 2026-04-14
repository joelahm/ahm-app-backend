const express = require('express');
const generatedSchemasController = require('./generated-schemas.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requirePermission } = require('../../middleware/requirePermission');

const router = express.Router();

router.use(authenticateAccessToken);

router.get('/', requirePermission('schema-generator-access'), generatedSchemasController.listGeneratedSchemas);
router.get('/:id', requirePermission('schema-generator-access'), generatedSchemasController.getGeneratedSchema);
router.post('/', requirePermission('generate-schema'), generatedSchemasController.createGeneratedSchema);
router.patch('/:id', requirePermission('edit-schema'), generatedSchemasController.updateGeneratedSchema);
router.delete('/:id', requirePermission('edit-schema'), generatedSchemasController.deleteGeneratedSchema);

module.exports = { generatedSchemasRouter: router };
