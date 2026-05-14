const { AppError } = require('../../lib/errors');
const projectsService = require('./projects.service');
const usersService = require('../users/users.service');
const notificationsService = require('../notifications/notifications.service');
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

function readAttachmentId(req) {
  const id = Number(req.params.attachmentId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid attachment id.');
  }
  return id;
}

function readChecklistId(req) {
  const id = Number(req.params.checklistId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid checklist id.');
  }
  return id;
}

function readChecklistItemId(req) {
  const id = Number(req.params.itemId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid checklist item id.');
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

    await notificationsService.notifyTaskAssigned({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      io: req.app.locals.io,
      taskId: task.id
    });

    if (task.parentTaskId && task.assignedToId) {
      await notificationsService.notifyTaskSubtaskAssigned({
        actorUserId: req.auth.userId,
        db: req.app.locals.db,
        env: req.app.locals.env,
        io: req.app.locals.io,
        subtaskId: task.id
      });
    }

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

    await notificationsService.notifyTaskAssigned({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      io: req.app.locals.io,
      taskId: task.id
    });

    if (task.parentTaskId && task.assignedToId) {
      await notificationsService.notifyTaskSubtaskAssigned({
        actorUserId: req.auth.userId,
        db: req.app.locals.db,
        env: req.app.locals.env,
        io: req.app.locals.io,
        subtaskId: task.id
      });
    }

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
}

async function updateProjectTask(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const previousTask = await req.app.locals.db.projectTask.findUnique({
      where: { id: BigInt(taskId) },
      select: {
        assignedTo: true,
        id: true,
        parentTaskId: true,
        status: true
      }
    });
    const task = await projectsService.updateTask({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
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

    if (
      task.assignedToId &&
      Number(previousTask?.assignedTo || 0) !== Number(task.assignedToId)
    ) {
      await notificationsService.notifyTaskAssigned({
        actorUserId: req.auth.userId,
        db: req.app.locals.db,
        env: req.app.locals.env,
        io: req.app.locals.io,
        taskId: task.id
      });

      if (task.parentTaskId) {
        await notificationsService.notifyTaskSubtaskAssigned({
          actorUserId: req.auth.userId,
          db: req.app.locals.db,
          env: req.app.locals.env,
          io: req.app.locals.io,
          subtaskId: task.id
        });
      }
    }

    await notificationsService.notifyTaskStatusChanged({
      actorUserId: req.auth.userId,
      db: req.app.locals.db,
      env: req.app.locals.env,
      io: req.app.locals.io,
      nextTask: task,
      previousTask
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
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
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
      actorRole: req.auth.role,
      actorUserId: req.auth.userId,
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

async function uploadTaskAttachment(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const attachment = await projectsService.createTaskAttachment({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      file: req.file,
      taskId
    });

    await notificationsService.notifyTaskAttachmentAdded({
      actorUserId: req.auth.userId,
      attachment,
      db: req.app.locals.db,
      env: req.app.locals.env,
      io: req.app.locals.io,
      taskId
    });

    res.status(200).json({ attachment });
  } catch (err) {
    next(err);
  }
}

async function listTaskAttachments(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const attachments = await projectsService.listTaskAttachments({
      db: req.app.locals.db,
      taskId
    });

    res.status(200).json({
      attachments,
      total: attachments.length
    });
  } catch (err) {
    next(err);
  }
}

async function deleteTaskAttachment(req, res, next) {
  try {
    const attachmentId = readAttachmentId(req);
    await projectsService.deleteTaskAttachment({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      attachmentId
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listChecklists(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const checklists = await projectsService.listChecklists({
      db: req.app.locals.db,
      taskId
    });

    res.status(200).json({ checklists });
  } catch (err) {
    next(err);
  }
}

async function createChecklist(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const checklist = await projectsService.createChecklist({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      taskId,
      payload: req.body || {}
    });

    res.status(201).json({ checklist });
  } catch (err) {
    next(err);
  }
}

async function updateChecklist(req, res, next) {
  try {
    const checklistId = readChecklistId(req);
    const checklist = await projectsService.updateChecklist({
      db: req.app.locals.db,
      checklistId,
      payload: req.body || {}
    });

    res.status(200).json({ checklist });
  } catch (err) {
    next(err);
  }
}

async function deleteChecklist(req, res, next) {
  try {
    const checklistId = readChecklistId(req);
    const data = await projectsService.deleteChecklist({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      checklistId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createChecklistItem(req, res, next) {
  try {
    const checklistId = readChecklistId(req);
    const item = await projectsService.createChecklistItem({
      db: req.app.locals.db,
      checklistId,
      payload: req.body || {}
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function updateChecklistItem(req, res, next) {
  try {
    const itemId = readChecklistItemId(req);
    const previousItem = await req.app.locals.db.taskChecklistItem.findUnique({
      where: { id: BigInt(itemId) },
      include: {
        checklist: {
          select: {
            taskId: true
          }
        }
      }
    });
    const item = await projectsService.updateChecklistItem({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      itemId,
      payload: req.body || {}
    });

    if (
      previousItem &&
      previousItem.isComplete === false &&
      item.isComplete === true
    ) {
      await notificationsService.notifyTaskChecklistItemCompleted({
        actorUserId: req.auth.userId,
        db: req.app.locals.db,
        env: req.app.locals.env,
        io: req.app.locals.io,
        item,
        taskId: previousItem.checklist.taskId
      });
    }

    res.status(200).json({ item });
  } catch (err) {
    next(err);
  }
}

async function deleteChecklistItem(req, res, next) {
  try {
    const itemId = readChecklistItemId(req);
    const data = await projectsService.deleteChecklistItem({
      db: req.app.locals.db,
      itemId
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

    await notificationsService.notifyTaskCommentCreated({
      actorUserId: req.auth.userId,
      comment,
      db: req.app.locals.db,
      env: req.app.locals.env,
      io: req.app.locals.io,
      taskId
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

async function listTaskActivity(req, res, next) {
  try {
    const taskId = readTaskId(req);
    const data = await projectsService.listTaskActivity({
      db: req.app.locals.db,
      taskId,
      before: req.query.before,
      limit: req.query.limit
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

async function resyncProjectTaskAssignees(req, res, next) {
  try {
    const projectId = readProjectIdParam(req);
    const isSuperadmin = await usersService.isSuperadminUser({
      db: req.app.locals.db,
      env: req.app.locals.env,
      userId: req.auth.userId,
    });

    if (!isSuperadmin) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only superadmins can resync project task assignees.',
      );
    }

    const result = await projectsService.resyncProjectTaskAssignees({
      db: req.app.locals.db,
      projectId,
    });

    await writeAuditLog({
      db: req.app.locals.db,
      req,
      actorUserId: req.auth.userId,
      action: 'PROJECT_TASK_ASSIGNEES_RESYNCED',
      resourceType: 'client_project',
      resourceId: projectId,
      metadata: {
        templateId: result.templateId,
        updated: result.updated,
        skipped: result.skipped,
        ambiguous: result.ambiguous,
        unmatched: result.unmatched,
        status: result.status,
      },
    });

    res.status(200).json(result);
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
  uploadTaskAttachment,
  listTaskAttachments,
  deleteTaskAttachment,
  listChecklists,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  createTaskComment,
  listTaskComments,
  deleteTaskComment,
  listTaskActivity,
  createProjectComment,
  listProjectComments,
  deleteProjectComment,
  resyncProjectTaskAssignees
};
