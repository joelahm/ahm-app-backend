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

async function uploadProjectTemplateAttachment(req, res, next) {
  try {
    if (!req.file) {
      const { AppError } = require('../../lib/errors');
      throw new AppError(400, 'VALIDATION_ERROR', 'file is required.');
    }

    const filename = req.file.filename;
    const url = `/uploads/project-template-attachments/${filename}`;

    res.status(201).json({
      attachment: {
        id: filename,
        filename: req.file.originalname,
        url,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProjectTemplates,
  listProjectTemplateStatusOptions,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
  uploadProjectTemplateAttachment,
};
