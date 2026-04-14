const generatedSchemasService = require('./generated-schemas.service');

async function listGeneratedSchemas(req, res, next) {
  try {
    const data = await generatedSchemasService.getGeneratedSchemas({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getGeneratedSchema(req, res, next) {
  try {
    const data = await generatedSchemasService.getGeneratedSchemaById({
      db: req.app.locals.db,
      schemaId: String(req.params.id || '')
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createGeneratedSchema(req, res, next) {
  try {
    const data = await generatedSchemasService.createGeneratedSchema({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateGeneratedSchema(req, res, next) {
  try {
    const data = await generatedSchemasService.updateGeneratedSchema({
      db: req.app.locals.db,
      schemaId: String(req.params.id || ''),
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}


async function deleteGeneratedSchema(req, res, next) {
  try {
    const data = await generatedSchemasService.deleteGeneratedSchema({
      db: req.app.locals.db,
      schemaId: String(req.params.id || '')
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGeneratedSchema,
  deleteGeneratedSchema,
  getGeneratedSchema,
  listGeneratedSchemas,
  updateGeneratedSchema
};
