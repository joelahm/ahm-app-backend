const schemaGeneratorSettingsService = require('./schema-generator-settings.service');

async function listSchemaTypes(req, res, next) {
  try {
    const data = await schemaGeneratorSettingsService.getSchemaTypes({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateSchemaTypes(req, res, next) {
  try {
    const data = await schemaGeneratorSettingsService.replaceSchemaTypes({
      db: req.app.locals.db,
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listMedicalSpecialties(req, res, next) {
  try {
    const data = await schemaGeneratorSettingsService.getMedicalSpecialties({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateMedicalSpecialties(req, res, next) {
  try {
    const data = await schemaGeneratorSettingsService.replaceMedicalSpecialties({
      db: req.app.locals.db,
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listServiceTypes(req, res, next) {
  try {
    const data = await schemaGeneratorSettingsService.getServiceTypes({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateServiceTypes(req, res, next) {
  try {
    const data = await schemaGeneratorSettingsService.replaceServiceTypes({
      db: req.app.locals.db,
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMedicalSpecialties,
  listSchemaTypes,
  listServiceTypes,
  updateMedicalSpecialties,
  updateSchemaTypes,
  updateServiceTypes
};
