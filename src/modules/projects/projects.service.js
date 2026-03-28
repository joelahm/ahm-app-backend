const { AppError } = require('../../lib/errors');
const ALLOWED_TASK_STATUSES = new Set([
  'TODO',
  'IN PROGRESS',
  'DONE',
  'ON HOLD'
]);

function parseOptionalUserId(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  return BigInt(id);
}

function parseOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid date.`);
  }
  return parsed;
}

function parseTaskStatus(value) {
  if (value === undefined || value === null || value === '') {
    return 'TODO';
  }

  const normalized = String(value).trim().toUpperCase();
  if (!ALLOWED_TASK_STATUSES.has(normalized)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'status must be TODO, IN PROGRESS, DONE, or ON HOLD.'
    );
  }

  return normalized;
}

function mapTask(task) {
  const assignedTo = task.assignedUser
    ? {
      id: Number(task.assignedUser.id),
      firstName: task.assignedUser.firstName ?? null,
      lastName: task.assignedUser.lastName ?? null,
      avatar: task.assignedUser.avatarUrl ?? null
    }
    : (task.assignedTo
      ? {
        id: Number(task.assignedTo),
        firstName: null,
        lastName: null,
        avatar: null
      }
      : null);

  return {
    id: Number(task.id),
    projectId: Number(task.projectId),
    task: task.task,
    taskName: task.task,
    projectType: task.projectType ?? null,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    assignedToId: task.assignedTo ? Number(task.assignedTo) : null,
    assigneeId: task.assignedTo ? Number(task.assignedTo) : null,
    assignedTo,
    createdBy: task.createdBy ? Number(task.createdBy) : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function mapComment(comment) {
  return {
    id: Number(comment.id),
    taskId: Number(comment.taskId),
    comment: comment.comment,
    createdBy: Number(comment.createdBy),
    author: comment.creator
      ? {
        id: Number(comment.creator.id),
        firstName: comment.creator.firstName ?? null,
        lastName: comment.creator.lastName ?? null,
        avatar: comment.creator.avatarUrl ?? null
      }
      : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

async function createTask({ db, actorUserId, projectId, payload }) {
  const taskName = String(payload.taskName || payload.task || '').trim();
  const projectType = payload.projectType === undefined ? null : String(payload.projectType || '').trim() || null;
  const description = payload.description === undefined ? null : String(payload.description || '').trim() || null;
  const status = parseTaskStatus(payload.status);
  const priority = payload.priority === undefined ? 'MEDIUM' : String(payload.priority || '').trim() || 'MEDIUM';
  const startDate = parseOptionalDate(payload.startDate, 'startDate');
  const dueDate = parseOptionalDate(payload.dueDate, 'dueDate');
  const assigneeRaw = payload.assigneeId !== undefined
    ? payload.assigneeId
    : (payload.assignedTo !== undefined ? payload.assignedTo : payload.assignedToId);
  const assignedTo = parseOptionalUserId(
    assigneeRaw,
    payload.assigneeId !== undefined
      ? 'assigneeId'
      : (payload.assignedTo !== undefined ? 'assignedTo' : 'assignedToId')
  );

  if (!taskName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'task is required.');
  }

  const projectExists = await db.clientProject.findUnique({
    where: { id: BigInt(projectId) },
    select: { id: true }
  });
  if (!projectExists) {
    throw new AppError(404, 'NOT_FOUND', 'Project not found.');
  }

  let created;
  try {
    created = await db.projectTask.create({
      data: {
        projectId: BigInt(projectId),
        task: taskName,
        projectType,
        description,
        status,
        priority,
        startDate,
        dueDate,
        assignedTo,
        createdBy: BigInt(actorUserId)
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true
          }
        }
      }
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(400, 'VALIDATION_ERROR', 'assignedTo must reference an existing user.');
    }
    throw err;
  }

  return mapTask(created);
}

async function updateTask({ db, taskId, payload }) {
  const existingTask = await db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    select: {
      id: true,
      projectId: true
    }
  });

  if (!existingTask) {
    throw new AppError(404, 'NOT_FOUND', 'Task not found.');
  }

  const taskName = payload.taskName === undefined && payload.task === undefined
    ? undefined
    : String(payload.taskName || payload.task || '').trim();
  const projectType = payload.projectType === undefined
    ? undefined
    : String(payload.projectType || '').trim() || null;
  const description = payload.description === undefined
    ? undefined
    : String(payload.description || '').trim() || null;
  const status = payload.status === undefined
    ? undefined
    : parseTaskStatus(payload.status);
  const priority = payload.priority === undefined
    ? undefined
    : String(payload.priority || '').trim() || 'MEDIUM';
  const startDate = payload.startDate === undefined
    ? undefined
    : parseOptionalDate(payload.startDate, 'startDate');
  const dueDate = payload.dueDate === undefined
    ? undefined
    : parseOptionalDate(payload.dueDate, 'dueDate');
  const assigneeRaw = payload.assigneeId !== undefined
    ? payload.assigneeId
    : (payload.assignedTo !== undefined ? payload.assignedTo : payload.assignedToId);
  const assignedTo = assigneeRaw === undefined
    ? undefined
    : parseOptionalUserId(
      assigneeRaw,
      payload.assigneeId !== undefined
        ? 'assigneeId'
        : (payload.assignedTo !== undefined ? 'assignedTo' : 'assignedToId')
    );
  const nextProjectId = payload.projectId === undefined
    ? undefined
    : Number(payload.projectId);

  if (taskName !== undefined && !taskName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'task is required.');
  }

  if (
    startDate &&
    dueDate &&
    startDate.getTime() > dueDate.getTime()
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'dueDate must be on or after startDate.'
    );
  }

  if (nextProjectId !== undefined) {
    if (!Number.isInteger(nextProjectId) || nextProjectId <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'projectId must be a positive integer.');
    }

    const projectExists = await db.clientProject.findUnique({
      where: { id: BigInt(nextProjectId) },
      select: { id: true }
    });
    if (!projectExists) {
      throw new AppError(404, 'NOT_FOUND', 'Project not found.');
    }
  }

  const patch = {
    task: taskName,
    projectId: nextProjectId === undefined ? undefined : BigInt(nextProjectId),
    projectType,
    description,
    status,
    priority,
    startDate,
    dueDate,
    assignedTo
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete patch[key];
    }
  }

  if (!Object.keys(patch).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported fields to update.');
  }

  let updated;
  try {
    updated = await db.projectTask.update({
      where: { id: BigInt(taskId) },
      data: patch,
      include: {
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true
          }
        }
      }
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(400, 'VALIDATION_ERROR', 'assignedTo must reference an existing user.');
    }
    throw err;
  }

  return mapTask(updated);
}

async function listTasksGroupedByProject({ db, clientId }) {
  let where = undefined;
  if (clientId !== undefined && clientId !== null && clientId !== '') {
    const parsedClientId = Number(clientId);
    if (!Number.isInteger(parsedClientId) || parsedClientId <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clientId must be a positive integer.');
    }
    where = {
      project: {
        clientId: BigInt(parsedClientId)
      }
    };
  }

  const tasks = await db.projectTask.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          project: true,
          clientId: true
        }
      },
      assignedUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true
        }
      }
    },
    orderBy: [
      { projectId: 'asc' },
      { id: 'desc' }
    ]
  });

  const grouped = new Map();
  for (const row of tasks) {
    const key = Number(row.projectId);
    if (!grouped.has(key)) {
      grouped.set(key, {
        projectId: Number(row.project.id),
        projectName: row.project.project,
        clientId: Number(row.project.clientId),
        tasks: []
      });
    }
    grouped.get(key).tasks.push(mapTask(row));
  }

  return {
    projects: Array.from(grouped.values()),
    totalProjects: grouped.size,
    totalTasks: tasks.length
  };
}

async function deleteTask({ db, taskId }) {
  try {
    await db.projectTask.delete({
      where: { id: BigInt(taskId) }
    });
  } catch (err) {
    if (err.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', 'Task not found.');
    }
    throw err;
  }

  return { success: true };
}

async function createTaskComment({ db, actorUserId, taskId, payload }) {
  const text = String(payload.comment || '').trim();
  if (!text) {
    throw new AppError(400, 'VALIDATION_ERROR', 'comment is required.');
  }

  const taskExists = await db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    select: { id: true }
  });
  if (!taskExists) {
    throw new AppError(404, 'NOT_FOUND', 'Task not found.');
  }

  const created = await db.taskComment.create({
    data: {
      taskId: BigInt(taskId),
      comment: text,
      createdBy: BigInt(actorUserId)
    },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true
        }
      }
    }
  });

  return mapComment(created);
}

async function listTaskComments({ db, taskId }) {
  const taskExists = await db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    select: { id: true }
  });
  if (!taskExists) {
    throw new AppError(404, 'NOT_FOUND', 'Task not found.');
  }

  const comments = await db.taskComment.findMany({
    where: { taskId: BigInt(taskId) },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { id: 'asc' }
  });

  return comments.map(mapComment);
}

async function deleteTaskComment({ db, actorUserId, commentId }) {
  const existing = await db.taskComment.findUnique({
    where: { id: BigInt(commentId) },
    select: { id: true, createdBy: true }
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Comment not found.');
  }

  if (Number(existing.createdBy) !== Number(actorUserId)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comment.');
  }

  await db.taskComment.delete({
    where: { id: BigInt(commentId) }
  });

  return { success: true };
}

module.exports = {
  createTask,
  updateTask,
  listTasksGroupedByProject,
  deleteTask,
  createTaskComment,
  listTaskComments,
  deleteTaskComment
};
