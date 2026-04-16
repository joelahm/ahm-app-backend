const clientsService = require('./clients.service');
const { AppError } = require('../../lib/errors');
const { writeAuditLog } = require('../../lib/audit-log');
const fs = require('fs/promises');
const path = require('path');

function readClientId(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid client id.');
  }
  return id;
}

function readCitationId(req) {
  const id = Number(req.params.citationId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid citation id.');
  }
  return id;
}

function readProjectId(req) {
  const id = Number(req.params.projectId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project id.');
  }
  return id;
}

async function listClients(req, res, next) {
  try {
    const clients = await clientsService.listClients({
      db: req.app.locals.db
    });

    res.status(200).json({
      clients,
      total: clients.length
    });
  } catch (err) {
    next(err);
  }
}

async function getClientById(req, res, next) {
  try {
    const clientId = readClientId(req);
    const client = await clientsService.getClientById({
      db: req.app.locals.db,
      clientId
    });

    res.status(200).json({ client });
  } catch (err) {
    next(err);
  }
}

async function getClientGbpDetails(req, res, next) {
  try {
    const clientId = readClientId(req);
    const gbpDetails = await clientsService.getClientGbpDetails({
      db: req.app.locals.db,
      clientId
    });

    res.status(200).json(gbpDetails);
  } catch (err) {
    next(err);
  }
}

async function listClientCitations(req, res, next) {
  try {
    const clientId = readClientId(req);
    const citations = await clientsService.listClientCitations({
      db: req.app.locals.db,
      clientId
    });

    res.status(200).json({
      citations,
      total: citations.length
    });
  } catch (err) {
    next(err);
  }
}

async function createClient(req, res, next) {
  try {
    const client = await clientsService.createClient({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'CLIENT_CREATED',
      resourceType: 'client',
      resourceId: client.id,
      metadata: {
        businessName: client.businessName
      }
    });

    res.status(201).json({ client });
  } catch (err) {
    next(err);
  }
}

async function patchClient(req, res, next) {
  try {
    const clientId = readClientId(req);
    const client = await clientsService.updateClient({
      db: req.app.locals.db,
      clientId,
      payload: req.body || {},
      files: req.files || []
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'CLIENT_UPDATED',
      resourceType: 'client',
      resourceId: clientId,
      metadata: {
        updatedFields: Object.keys(req.body || {})
      }
    });

    res.status(200).json({ client });
  } catch (err) {
    if (Array.isArray(req.files)) {
      for (const file of req.files) {
        if (!file?.path) continue;
        const uploadedPath = path.resolve(file.path);
        fs.unlink(uploadedPath).catch(() => {});
      }
    }
    next(err);
  }
}

async function createClientProject(req, res, next) {
  try {
    const clientId = readClientId(req);
    const project = await clientsService.createClientProject({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      clientId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'PROJECT_CREATED',
      resourceType: 'client_project',
      resourceId: project.id,
      metadata: {
        clientId,
        project: project.project
      }
    });

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
}

async function deleteClientProject(req, res, next) {
  try {
    const clientId = readClientId(req);
    const projectId = readProjectId(req);
    const deletedProject = await clientsService.deleteClientProject({
      db: req.app.locals.db,
      clientId,
      projectId
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'PROJECT_DELETED',
      resourceType: 'client_project',
      resourceId: projectId,
      metadata: { clientId }
    });

    res.status(200).json({ project: deletedProject });
  } catch (err) {
    next(err);
  }
}

async function patchClientProject(req, res, next) {
  try {
    const clientId = readClientId(req);
    const projectId = readProjectId(req);
    const project = await clientsService.updateClientProject({
      db: req.app.locals.db,
      clientId,
      projectId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'PROJECT_UPDATED',
      resourceType: 'client_project',
      resourceId: projectId,
      metadata: {
        clientId,
        updatedFields: Object.keys(req.body || {})
      }
    });

    res.status(200).json({ project });
  } catch (err) {
    next(err);
  }
}

async function createClientCitation(req, res, next) {
  try {
    const clientId = readClientId(req);
    const citation = await clientsService.createClientCitation({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      clientId,
      payload: req.body || {}
    });

    res.status(201).json({ citation });
  } catch (err) {
    next(err);
  }
}

async function patchClientCitation(req, res, next) {
  try {
    const clientId = readClientId(req);
    const citationId = readCitationId(req);
    const citation = await clientsService.updateClientCitation({
      db: req.app.locals.db,
      clientId,
      citationId,
      payload: req.body || {}
    });

    res.status(200).json({ citation });
  } catch (err) {
    next(err);
  }
}

async function deleteClientCitation(req, res, next) {
  try {
    const clientId = readClientId(req);
    const citationId = readCitationId(req);
    const result = await clientsService.deleteClientCitation({
      db: req.app.locals.db,
      clientId,
      citationId
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function listClientProjects(req, res, next) {
  try {
    const clientId = readClientId(req);
    const data = await clientsService.listClientProjects({
      db: req.app.locals.db,
      clientId,
      page: req.query.page,
      limit: req.query.limit
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listClients,
  getClientById,
  getClientGbpDetails,
  listClientCitations,
  createClient,
  patchClient,
  createClientCitation,
  patchClientCitation,
  deleteClientCitation,
  createClientProject,
  patchClientProject,
  deleteClientProject,
  listClientProjects
};
