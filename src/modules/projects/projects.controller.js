const { AppError } = require('../../lib/errors');
const projectsService = require('./projects.service');
const { writeAuditLog } = require('../../lib/audit-log');

function readProjectId(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project id.');
  }
  return id;
}

function readProjectIdParam(req) {
  const id = Number(req.params.projectId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project id.');
  }
  return id;
}

function readProjectIdFromBody(req) {
  const id = Number(req.body?.projectId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'projectId must be a positive integer.');
  }
  return id;
}

function readTaskId(req) {
  const id = Number(req.params.taskId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid task id.');
  }
  return id;
}

function readCommentId(req) {
  const id = Number(req.params.commentId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid comment id.');
  }
  return id;
}

async function createProjectTask(req, res, next) {
  try {
    const projectId = readProjectId(req);
    const task = await projectsService.createTask({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      projectId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'TASK_CREATED',
      resourceType: 'project_task',
      resourceId: task.id,
      metadata: {
        projectId,
        task: task.task
      }
    });

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
}

async function createProjectTaskFromBody(req, res, next) {
  try {
    const projectId = readProjectIdFromBody(req);
    const task = await projectsService.createTask({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      projectId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'TASK_CREATED',
      resourceType: 'project_task',
      resourceId: task.id,
      metadata: {
        projectId,
        task: task.task
      }
    });

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
}

async function updateProjectTask(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const task = await projectsService.updateTask({
      db: req.app.locals.db,
      taskId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'TASK_UPDATED',
      resourceType: 'project_task',
      resourceId: taskId,
      metadata: {
        updatedFields: Object.keys(req.body || {})
      }
    });

    res.status(200).json({ task });
  } catch (err) {
    next(err);
  }
}

async function listProjects(req, res, next) {
  try {
    const data = await projectsService.listProjects({
      db: req.app.locals.db,
      query: req.query || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function listTasksGroupedByProject(req, res, next) {
  try {
    const data = await projectsService.listTasksGroupedByProject({
      db: req.app.locals.db,
      clientId: req.query.clientId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteProjectTask(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const data = await projectsService.deleteTask({
      db: req.app.locals.db,
      taskId
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'TASK_DELETED',
      resourceType: 'project_task',
      resourceId: taskId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createTaskComment(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const comment = await projectsService.createTaskComment({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      taskId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'TASK_COMMENT_CREATED',
      resourceType: 'task_comment',
      resourceId: comment.id,
      metadata: {
        taskId
      }
    });

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

async function listTaskComments(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const comments = await projectsService.listTaskComments({
      db: req.app.locals.db,
      taskId
    });

    res.status(200).json({
      comments,
      total: comments.length
    });
  } catch (err) {
    next(err);
  }
}

async function deleteTaskComment(req, res, next) {
  try {
    const commentId = readCommentId(req);
    const data = await projectsService.deleteTaskComment({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      commentId
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'TASK_COMMENT_DELETED',
      resourceType: 'task_comment',
      resourceId: commentId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createProjectComment(req, res, next) {
  try {
    const projectId = readProjectIdParam(req);
    const comment = await projectsService.createProjectComment({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      projectId,
      payload: req.body || {}
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'PROJECT_COMMENT_CREATED',
      resourceType: 'project_comment',
      resourceId: comment.id,
      metadata: {
        projectId
      }
    });

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

async function listProjectComments(req, res, next) {
  try {
    const projectId = readProjectIdParam(req);
    const comments = await projectsService.listProjectComments({
      db: req.app.locals.db,
      projectId
    });

    res.status(200).json({
      comments,
      total: comments.length
    });
  } catch (err) {
    next(err);
  }
}

async function deleteProjectComment(req, res, next) {
  try {
    const commentId = readCommentId(req);
    const data = await projectsService.deleteProjectComment({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      commentId
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'PROJECT_COMMENT_DELETED',
      resourceType: 'project_comment',
      resourceId: commentId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProjects,
  listTasksGroupedByProject,
  createProjectTask,
  createProjectTaskFromBody,
  updateProjectTask,
  deleteProjectTask,
  createTaskComment,
  listTaskComments,
  deleteTaskComment,
  createProjectComment,
  listProjectComments,
  deleteProjectComment
};
