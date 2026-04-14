const projectTemplatesService = require('./project-templates.service');

async function listProjectTemplates(req, res, next) {
  try {
    const data = await projectTemplatesService.getProjectTemplates({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listProjectTemplateStatusOptions(req, res, next) {
  try {
    const data = await projectTemplatesService.getProjectTemplateStatusOptions({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createProjectTemplate(req, res, next) {
  try {
    const data = await projectTemplatesService.createProjectTemplate({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteProjectTemplate(req, res, next) {
  try {
    const data = await projectTemplatesService.deleteProjectTemplate({
      db: req.app.locals.db,
      templateId: String(req.params.id || '')
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateProjectTemplate(req, res, next) {
  try {
    const data = await projectTemplatesService.updateProjectTemplate({
      db: req.app.locals.db,
      templateId: String(req.params.id || ''),
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProjectTemplates,
  listProjectTemplateStatusOptions,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate
};
