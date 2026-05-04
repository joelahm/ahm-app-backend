const { AppError } = require("../../lib/errors");
const DEFAULT_TASK_STATUSES = [
  "To Do",
  "In Progress",
  "Internal Review",
  "Client Review",
  "On Hold",
  "Completed",
];
const PROJECT_TASK_STATUS_OPTIONS_SETTINGS_KEY = "project_task_status_options";
const DUE_DATE_RULE_TYPES = {
  BLOCKED_TASK: "BLOCKED_TASK",
  TRIGGER: "TRIGGER",
};

function normalizeTaskStatusLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized === "done" || normalized === "completed") {
    return "Completed";
  }

  if (normalized === "in progress") {
    return "In Progress";
  }

  if (normalized === "internal review") {
    return "Internal Review";
  }

  if (normalized === "client review") {
    return "Client Review";
  }

  if (normalized === "on hold") {
    return "On Hold";
  }

  if (normalized === "to do" || normalized === "todo") {
    return "To Do";
  }

  return null;
}

function normalizeProjectStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) return "On Going";
  if (
    [
      "active",
      "draft",
      "implementation",
      "in progress",
      "onboarding",
      "ongoing",
      "on going",
      "planning",
    ].includes(normalized)
  ) {
    return "On Going";
  }
  if (normalized === "on hold" || normalized === "hold") return "On Hold";
  if (
    ["closed", "complete", "completed", "done", "finished"].includes(normalized)
  )
    return "Completed";
  if (normalized === "cancel" || normalized === "cancelled") return "Cancelled";
  if (normalized === "archived") return "Archived";
  if (normalized === "delayed" || normalized === "overdue") return "Delayed";

  return "On Going";
}

function isAdminRole(role) {
  return String(role || "").trim().toUpperCase() === "ADMIN";
}

function buildAssignedProjectWhere(actorUserId) {
  return {
    OR: [
      { clientSuccessManagerId: BigInt(actorUserId) },
      { accountManagerId: BigInt(actorUserId) },
      { tasks: { some: { assignedTo: BigInt(actorUserId) } } },
    ],
  };
}

function normalizeTaskStatusOptionsValue(value) {
  const source = typeof value === "object" && value !== null ? value : {};
  const rawOptions = Array.isArray(source.statusOptions)
    ? source.statusOptions
    : Array.isArray(source.options)
      ? source.options
      : [];

  const normalized = rawOptions
    .map((item) => {
      if (typeof item === "string") {
        return normalizeTaskStatusLabel(item);
      }

      const itemSource = typeof item === "object" && item !== null ? item : {};
      return normalizeTaskStatusLabel(
        itemSource.label || itemSource.value || itemSource.name || "",
      );
    })
    .filter(Boolean);

  const unique = Array.from(new Set(normalized));
  const ordered = DEFAULT_TASK_STATUSES.filter((status) =>
    unique.includes(status),
  );

  return ordered.length ? ordered : DEFAULT_TASK_STATUSES;
}

async function persistTaskStatusOptions({ db, statusOptions }) {
  await db.appSetting.upsert({
    where: { key: PROJECT_TASK_STATUS_OPTIONS_SETTINGS_KEY },
    create: {
      key: PROJECT_TASK_STATUS_OPTIONS_SETTINGS_KEY,
      valueJson: { statusOptions },
    },
    update: {
      valueJson: { statusOptions },
    },
  });
}

function parseOptionalUserId(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must be a positive integer.`,
    );
  }
  return BigInt(id);
}

function parseOptionalTaskId(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must be a positive integer.`,
    );
  }
  return BigInt(id);
}

function parseOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must be a valid date.`,
    );
  }
  return parsed;
}

function addDays(date, days) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function parseDueDateOffsetDays(payload) {
  const rawValue = payload.dueDateOffsetDays ?? payload.remapDays;

  if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
    const parsed = Number(rawValue);

    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "dueDateOffsetDays must be a non-negative integer.",
      );
    }

    return parsed;
  }

  const dueDateTrigger = String(payload.dueDateTrigger || "").trim();
  const match = dueDateTrigger.match(/^(\d+)/);

  return match ? Number(match[1]) : 0;
}

function hasDueDateRulePayload(payload) {
  return (
    payload.enableDependency !== undefined ||
    payload.blockedTaskId !== undefined ||
    payload.dependencyType !== undefined ||
    payload.dueDateTrigger !== undefined ||
    payload.dueDateRuleType !== undefined ||
    payload.dueDateOffsetDays !== undefined ||
    payload.remapDays !== undefined
  );
}

function normalizeDueDateRuleType(payload, blockedTaskId) {
  const explicitRuleType = String(payload.dueDateRuleType || "")
    .trim()
    .toUpperCase();

  if (explicitRuleType === DUE_DATE_RULE_TYPES.BLOCKED_TASK) {
    return DUE_DATE_RULE_TYPES.BLOCKED_TASK;
  }

  if (explicitRuleType === DUE_DATE_RULE_TYPES.TRIGGER) {
    return DUE_DATE_RULE_TYPES.TRIGGER;
  }

  const dependencyType = String(payload.dependencyType || "")
    .trim()
    .toLowerCase();
  const dueDateTrigger = String(payload.dueDateTrigger || "")
    .trim()
    .toLowerCase();

  if (
    blockedTaskId ||
    dependencyType.includes("blocked") ||
    dueDateTrigger.includes("blocked")
  ) {
    return DUE_DATE_RULE_TYPES.BLOCKED_TASK;
  }

  return DUE_DATE_RULE_TYPES.TRIGGER;
}

function calculateRuleDueDate({ blockedTask, offsetDays, project, ruleType }) {
  if (ruleType === DUE_DATE_RULE_TYPES.BLOCKED_TASK) {
    if (!blockedTask?.dueDate) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Blocked task must have a due date before dependent task due date can be calculated.",
      );
    }

    return addDays(blockedTask.dueDate, offsetDays);
  }

  return addDays(project.createdAt, offsetDays);
}

async function validateBlockedTask({ blockedTaskId, db, projectId, taskId }) {
  if (!blockedTaskId) {
    return null;
  }

  const blockedTask = await db.projectTask.findUnique({
    where: { id: blockedTaskId },
    select: {
      dueDate: true,
      id: true,
      projectId: true,
    },
  });

  if (!blockedTask) {
    throw new AppError(404, "NOT_FOUND", "Blocked task not found.");
  }

  if (Number(blockedTask.projectId) !== Number(projectId)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "blockedTaskId must reference a task in the same project.",
    );
  }

  if (taskId && Number(blockedTask.id) === Number(taskId)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Task cannot depend on itself.",
    );
  }

  return blockedTask;
}

async function assertNoBlockedTaskCycle({ blockedTaskId, db, taskId }) {
  if (!blockedTaskId || !taskId) {
    return;
  }

  const visited = new Set();
  let currentTaskId = blockedTaskId;

  while (currentTaskId) {
    const key = String(currentTaskId);

    if (visited.has(key)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Blocked task dependency cycle detected.",
      );
    }

    if (Number(currentTaskId) === Number(taskId)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Blocked task dependency cycle detected.",
      );
    }

    visited.add(key);

    const task = await db.projectTask.findUnique({
      where: { id: currentTaskId },
      select: { blockedTaskId: true },
    });

    currentTaskId = task?.blockedTaskId || null;
  }
}

async function recalculateDependentDueDates({ db, projectId, rootTaskId }) {
  const tasks = await db.projectTask.findMany({
    where: { projectId: BigInt(projectId) },
    select: {
      blockedTaskId: true,
      dueDate: true,
      dueDateOffsetDays: true,
      dueDateRuleType: true,
      id: true,
    },
  });
  const taskById = new Map(tasks.map((task) => [String(task.id), task]));
  const childrenByBlockedTaskId = new Map();

  tasks.forEach((task) => {
    if (
      !task.blockedTaskId ||
      task.dueDateRuleType !== DUE_DATE_RULE_TYPES.BLOCKED_TASK
    ) {
      return;
    }

    const key = String(task.blockedTaskId);
    const current = childrenByBlockedTaskId.get(key) || [];

    current.push(task);
    childrenByBlockedTaskId.set(key, current);
  });

  const queue = [String(rootTaskId)];
  const visited = new Set();

  while (queue.length) {
    const currentTaskId = queue.shift();

    if (!currentTaskId || visited.has(currentTaskId)) {
      continue;
    }

    visited.add(currentTaskId);

    const blockedTask = taskById.get(currentTaskId);
    const dependentTasks = childrenByBlockedTaskId.get(currentTaskId) || [];

    for (const dependentTask of dependentTasks) {
      if (!blockedTask?.dueDate) {
        continue;
      }

      const nextDueDate = addDays(
        blockedTask.dueDate,
        dependentTask.dueDateOffsetDays || 0,
      );

      await db.projectTask.update({
        where: { id: dependentTask.id },
        data: {
          dueDate: nextDueDate,
          dueDateManualOverride: false,
        },
      });

      dependentTask.dueDate = nextDueDate;
      taskById.set(String(dependentTask.id), dependentTask);
      queue.push(String(dependentTask.id));
    }
  }
}

async function getAllowedTaskStatuses(db) {
  const setting = await db.appSetting.findUnique({
    where: { key: PROJECT_TASK_STATUS_OPTIONS_SETTINGS_KEY },
    select: { valueJson: true },
  });
  const allowedTaskStatuses = normalizeTaskStatusOptionsValue(
    setting?.valueJson,
  );

  if (!setting) {
    await persistTaskStatusOptions({ db, statusOptions: allowedTaskStatuses });
  }

  return allowedTaskStatuses;
}

async function parseTaskStatus(db, value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_TASK_STATUSES[0];
  }

  const normalized = normalizeTaskStatusLabel(value);
  if (!normalized) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `status must be one of: ${DEFAULT_TASK_STATUSES.join(", ")}.`,
    );
  }

  const allowedTaskStatuses = await getAllowedTaskStatuses(db);
  const matchedStatus = allowedTaskStatuses.find(
    (status) => status === normalized,
  );

  if (!matchedStatus) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `status must be one of: ${allowedTaskStatuses.join(", ")}.`,
    );
  }

  return matchedStatus;
}

function mapTask(task) {
  const assignedTo = task.assignedUser
    ? {
        id: Number(task.assignedUser.id),
        firstName: task.assignedUser.firstName ?? null,
        lastName: task.assignedUser.lastName ?? null,
        avatar: task.assignedUser.avatarUrl ?? null,
      }
    : task.assignedTo
      ? {
          id: Number(task.assignedTo),
          firstName: null,
          lastName: null,
          avatar: null,
        }
      : null;

  return {
    id: Number(task.id),
    projectId: Number(task.projectId),
    parentTaskId: task.parentTaskId ? Number(task.parentTaskId) : null,
    task: task.task,
    taskName: task.task,
    projectType: task.projectType ?? null,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    blockedTaskId: task.blockedTaskId ? Number(task.blockedTaskId) : null,
    dueDateRuleType: task.dueDateRuleType ?? null,
    dueDateOffsetDays: task.dueDateOffsetDays ?? 0,
    dueDateManualOverride: Boolean(task.dueDateManualOverride),
    templateTaskId: task.templateTaskId ?? null,
    assignedToId: task.assignedTo ? Number(task.assignedTo) : null,
    assigneeId: task.assignedTo ? Number(task.assignedTo) : null,
    assignedTo,
    createdBy: task.createdBy ? Number(task.createdBy) : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
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
          avatar: comment.creator.avatarUrl ?? null,
        }
      : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

function mapProjectComment(comment) {
  return {
    id: Number(comment.id),
    projectId: Number(comment.projectId),
    comment: comment.comment,
    createdBy: Number(comment.createdBy),
    author: comment.creator
      ? {
          id: Number(comment.creator.id),
          firstName: comment.creator.firstName ?? null,
          lastName: comment.creator.lastName ?? null,
          avatar: comment.creator.avatarUrl ?? null,
        }
      : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

async function createTask({ db, actorUserId, projectId, payload }) {
  const taskName = String(payload.taskName || payload.task || "").trim();
  const projectType =
    payload.projectType === undefined
      ? null
      : String(payload.projectType || "").trim() || null;
  const description =
    payload.description === undefined
      ? null
      : String(payload.description || "").trim() || null;
  const status = await parseTaskStatus(db, payload.status);
  const priority =
    payload.priority === undefined
      ? "MEDIUM"
      : String(payload.priority || "").trim() || "MEDIUM";
  const startDate = parseOptionalDate(payload.startDate, "startDate");
  let dueDate = parseOptionalDate(payload.dueDate, "dueDate");
  const assigneeRaw =
    payload.assigneeId !== undefined
      ? payload.assigneeId
      : payload.assignedTo !== undefined
        ? payload.assignedTo
        : payload.assignedToId;
  const assignedTo = parseOptionalUserId(
    assigneeRaw,
    payload.assigneeId !== undefined
      ? "assigneeId"
      : payload.assignedTo !== undefined
        ? "assignedTo"
        : "assignedToId",
  );
  const parentTaskId = parseOptionalTaskId(
    payload.parentTaskId,
    "parentTaskId",
  );
  const blockedTaskId = parseOptionalTaskId(
    payload.blockedTaskId,
    "blockedTaskId",
  );
  const hasRule = hasDueDateRulePayload(payload);
  const dueDateRuleType = hasRule
    ? normalizeDueDateRuleType(payload, blockedTaskId)
    : null;
  const dueDateOffsetDays = hasRule ? parseDueDateOffsetDays(payload) : 0;
  const templateTaskId =
    payload.templateTaskId === undefined
      ? null
      : String(payload.templateTaskId || "").trim() || null;

  if (!taskName) {
    throw new AppError(400, "VALIDATION_ERROR", "task is required.");
  }

  const projectExists = await db.clientProject.findUnique({
    where: { id: BigInt(projectId) },
    select: { createdAt: true, id: true },
  });
  if (!projectExists) {
    throw new AppError(404, "NOT_FOUND", "Project not found.");
  }

  if (parentTaskId) {
    const parentTask = await db.projectTask.findUnique({
      where: { id: parentTaskId },
      select: { id: true, projectId: true },
    });

    if (!parentTask) {
      throw new AppError(404, "NOT_FOUND", "Parent task not found.");
    }

    if (Number(parentTask.projectId) !== Number(projectId)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "parentTaskId must reference a task in the same project.",
      );
    }
  }

  const blockedTask = await validateBlockedTask({
    blockedTaskId,
    db,
    projectId,
  });

  if (dueDateRuleType === DUE_DATE_RULE_TYPES.BLOCKED_TASK && !blockedTaskId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "blockedTaskId is required for blocked task due date rules.",
    );
  }

  if (hasRule) {
    dueDate = calculateRuleDueDate({
      blockedTask,
      offsetDays: dueDateOffsetDays,
      project: projectExists,
      ruleType: dueDateRuleType,
    });
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
        ...(parentTaskId ? { parentTaskId } : {}),
        ...(blockedTaskId ? { blockedTaskId } : {}),
        dueDateRuleType,
        dueDateOffsetDays,
        dueDateManualOverride: !hasRule && Boolean(dueDate),
        templateTaskId,
        assignedTo,
        createdBy: BigInt(actorUserId),
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
  } catch (err) {
    if (err.code === "P2003") {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "assignedTo must reference an existing user.",
      );
    }
    throw err;
  }

  return mapTask(created);
}

async function updateTask({ db, taskId, payload }) {
  const existingTask = await db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    select: {
      blockedTaskId: true,
      dueDateOffsetDays: true,
      dueDateRuleType: true,
      id: true,
      projectId: true,
    },
  });

  if (!existingTask) {
    throw new AppError(404, "NOT_FOUND", "Task not found.");
  }

  const taskName =
    payload.taskName === undefined && payload.task === undefined
      ? undefined
      : String(payload.taskName || payload.task || "").trim();
  const projectType =
    payload.projectType === undefined
      ? undefined
      : String(payload.projectType || "").trim() || null;
  const description =
    payload.description === undefined
      ? undefined
      : String(payload.description || "").trim() || null;
  const status =
    payload.status === undefined
      ? undefined
      : await parseTaskStatus(db, payload.status);
  const priority =
    payload.priority === undefined
      ? undefined
      : String(payload.priority || "").trim() || "MEDIUM";
  const startDate =
    payload.startDate === undefined
      ? undefined
      : parseOptionalDate(payload.startDate, "startDate");
  let dueDate =
    payload.dueDate === undefined
      ? undefined
      : parseOptionalDate(payload.dueDate, "dueDate");
  const assigneeRaw =
    payload.assigneeId !== undefined
      ? payload.assigneeId
      : payload.assignedTo !== undefined
        ? payload.assignedTo
        : payload.assignedToId;
  const assignedTo =
    assigneeRaw === undefined
      ? undefined
      : parseOptionalUserId(
          assigneeRaw,
          payload.assigneeId !== undefined
            ? "assigneeId"
            : payload.assignedTo !== undefined
              ? "assignedTo"
              : "assignedToId",
        );
  const parentTaskId =
    payload.parentTaskId === undefined
      ? undefined
      : parseOptionalTaskId(payload.parentTaskId, "parentTaskId");
  const blockedTaskId =
    payload.blockedTaskId === undefined
      ? undefined
      : parseOptionalTaskId(payload.blockedTaskId, "blockedTaskId");
  const nextProjectId =
    payload.projectId === undefined ? undefined : Number(payload.projectId);
  const targetProjectId =
    nextProjectId === undefined
      ? Number(existingTask.projectId)
      : nextProjectId;
  const shouldUpdateRule = hasDueDateRulePayload(payload);
  const nextBlockedTaskId =
    blockedTaskId === undefined ? existingTask.blockedTaskId : blockedTaskId;
  const dueDateRuleType = shouldUpdateRule
    ? normalizeDueDateRuleType(payload, nextBlockedTaskId)
    : undefined;
  const dueDateOffsetDays = shouldUpdateRule
    ? parseDueDateOffsetDays(payload)
    : undefined;
  const templateTaskId =
    payload.templateTaskId === undefined
      ? undefined
      : String(payload.templateTaskId || "").trim() || null;

  if (taskName !== undefined && !taskName) {
    throw new AppError(400, "VALIDATION_ERROR", "task is required.");
  }

  if (startDate && dueDate && startDate.getTime() > dueDate.getTime()) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "dueDate must be on or after startDate.",
    );
  }

  if (nextProjectId !== undefined) {
    if (!Number.isInteger(nextProjectId) || nextProjectId <= 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "projectId must be a positive integer.",
      );
    }

    const projectExists = await db.clientProject.findUnique({
      where: { id: BigInt(nextProjectId) },
      select: { id: true },
    });
    if (!projectExists) {
      throw new AppError(404, "NOT_FOUND", "Project not found.");
    }
  }

  if (parentTaskId !== undefined && parentTaskId !== null) {
    const parentTask = await db.projectTask.findUnique({
      where: { id: parentTaskId },
      select: { id: true, projectId: true },
    });

    if (!parentTask) {
      throw new AppError(404, "NOT_FOUND", "Parent task not found.");
    }

    if (Number(parentTask.projectId) !== targetProjectId) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "parentTaskId must reference a task in the same project.",
      );
    }

    if (Number(parentTask.id) === Number(taskId)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Task cannot be parent of itself.",
      );
    }
  }

  const blockedTask = await validateBlockedTask({
    blockedTaskId: nextBlockedTaskId,
    db,
    projectId: targetProjectId,
    taskId,
  });

  await assertNoBlockedTaskCycle({
    blockedTaskId: nextBlockedTaskId,
    db,
    taskId,
  });

  if (
    dueDateRuleType === DUE_DATE_RULE_TYPES.BLOCKED_TASK &&
    !nextBlockedTaskId
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "blockedTaskId is required for blocked task due date rules.",
    );
  }

  if (shouldUpdateRule && dueDate === undefined) {
    const project = await db.clientProject.findUnique({
      where: { id: BigInt(targetProjectId) },
      select: { createdAt: true, id: true },
    });

    if (!project) {
      throw new AppError(404, "NOT_FOUND", "Project not found.");
    }

    dueDate = calculateRuleDueDate({
      blockedTask,
      offsetDays: dueDateOffsetDays,
      project,
      ruleType: dueDateRuleType,
    });
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
    parentTaskId,
    blockedTaskId,
    dueDateRuleType,
    dueDateOffsetDays,
    dueDateManualOverride:
      dueDate === undefined ? undefined : !shouldUpdateRule,
    templateTaskId,
    assignedTo,
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete patch[key];
    }
  }

  if (!Object.keys(patch).length) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "No supported fields to update.",
    );
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
            avatarUrl: true,
          },
        },
      },
    });
  } catch (err) {
    if (err.code === "P2003") {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "assignedTo must reference an existing user.",
      );
    }
    throw err;
  }

  if (dueDate !== undefined) {
    await recalculateDependentDueDates({
      db,
      projectId: updated.projectId,
      rootTaskId: updated.id,
    });
  }

  return mapTask(updated);
}

async function listTasksGroupedByProject({ db, clientId, actorUserId, actorRole }) {
  const filters = [];

  if (clientId !== undefined && clientId !== null && clientId !== "") {
    const parsedClientId = Number(clientId);
    if (!Number.isInteger(parsedClientId) || parsedClientId <= 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "clientId must be a positive integer.",
      );
    }
    filters.push({
      project: {
        clientId: BigInt(parsedClientId),
      },
    });
  }

  if (!isAdminRole(actorRole)) {
    filters.push({ assignedTo: BigInt(actorUserId) });
  }

  const where = filters.length ? { AND: filters } : undefined;

  const tasks = await db.projectTask.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          project: true,
          clientId: true,
        },
      },
      assignedUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: [{ projectId: "asc" }, { id: "desc" }],
  });

  const grouped = new Map();
  for (const row of tasks) {
    const key = Number(row.projectId);
    if (!grouped.has(key)) {
      grouped.set(key, {
        projectId: Number(row.project.id),
        projectName: row.project.project,
        clientId: Number(row.project.clientId),
        clientName: row.project.client ? row.project.client.client : null,
        tasks: [],
      });
    }
    grouped.get(key).tasks.push(mapTask(row));
  }

  return {
    projects: Array.from(grouped.values()),
    totalProjects: grouped.size,
    totalTasks: tasks.length,
  };
}

async function deleteTask({ db, taskId }) {
  try {
    await db.projectTask.delete({
      where: { id: BigInt(taskId) },
    });
  } catch (err) {
    if (err.code === "P2025") {
      throw new AppError(404, "NOT_FOUND", "Task not found.");
    }
    throw err;
  }

  return { success: true };
}

async function createTaskComment({ db, actorUserId, taskId, payload }) {
  const text = String(payload.comment || "").trim();
  if (!text) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required.");
  }

  const taskExists = await db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    select: { id: true },
  });
  if (!taskExists) {
    throw new AppError(404, "NOT_FOUND", "Task not found.");
  }

  const created = await db.taskComment.create({
    data: {
      taskId: BigInt(taskId),
      comment: text,
      createdBy: BigInt(actorUserId),
    },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return mapComment(created);
}

async function listTaskComments({ db, taskId }) {
  const taskExists = await db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    select: { id: true },
  });
  if (!taskExists) {
    throw new AppError(404, "NOT_FOUND", "Task not found.");
  }

  const comments = await db.taskComment.findMany({
    where: { taskId: BigInt(taskId) },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return comments.map(mapComment);
}

async function deleteTaskComment({ db, actorUserId, commentId }) {
  const existing = await db.taskComment.findUnique({
    where: { id: BigInt(commentId) },
    select: { id: true, createdBy: true },
  });
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Comment not found.");
  }

  if (Number(existing.createdBy) !== Number(actorUserId)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You can only delete your own comment.",
    );
  }

  await db.taskComment.delete({
    where: { id: BigInt(commentId) },
  });

  return { success: true };
}

async function createProjectComment({ db, actorUserId, projectId, payload }) {
  const text = String(payload.comment || "").trim();
  if (!text) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required.");
  }

  const projectExists = await db.clientProject.findUnique({
    where: { id: BigInt(projectId) },
    select: { id: true },
  });
  if (!projectExists) {
    throw new AppError(404, "NOT_FOUND", "Project not found.");
  }

  const created = await db.projectComment.create({
    data: {
      projectId: BigInt(projectId),
      comment: text,
      createdBy: BigInt(actorUserId),
    },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return mapProjectComment(created);
}

async function listProjectComments({ db, projectId }) {
  const projectExists = await db.clientProject.findUnique({
    where: { id: BigInt(projectId) },
    select: { id: true },
  });
  if (!projectExists) {
    throw new AppError(404, "NOT_FOUND", "Project not found.");
  }

  const comments = await db.projectComment.findMany({
    where: { projectId: BigInt(projectId) },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return comments.map(mapProjectComment);
}

async function deleteProjectComment({ db, actorUserId, commentId }) {
  const existing = await db.projectComment.findUnique({
    where: { id: BigInt(commentId) },
    select: { id: true, createdBy: true },
  });
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Comment not found.");
  }

  if (Number(existing.createdBy) !== Number(actorUserId)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You can only delete your own comment.",
    );
  }

  await db.projectComment.delete({
    where: { id: BigInt(commentId) },
  });

  return { success: true };
}

const PROJECT_LIST_GROUP_BY_KEYS = [
  "projects",
  "client",
  "status",
  "phase",
  "progress",
];

function normalizeGroupBy(value) {
  const normalized = String(value || "projects")
    .trim()
    .toLowerCase();
  if (!PROJECT_LIST_GROUP_BY_KEYS.includes(normalized)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `groupBy must be one of: ${PROJECT_LIST_GROUP_BY_KEYS.join(", ")}.`,
    );
  }
  return normalized;
}

function normalizeClientStatusLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "Active";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDisplayDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function calculateProjectProgressPercent(tasks) {
  if (!tasks.length) {
    return 0;
  }

  const completedCount = tasks.filter((task) => {
    const normalizedStatus = String(task.status || "")
      .trim()
      .toUpperCase();
    return normalizedStatus === "DONE" || normalizedStatus === "COMPLETED";
  }).length;

  return Math.round((completedCount / tasks.length) * 100);
}

function computeProjectOverdueCount(tasks) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  return tasks.filter((task) => {
    if (!task.dueDate) {
      return false;
    }

    const dueDate = new Date(task.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }

    const normalizedStatus = String(task.status || "")
      .trim()
      .toUpperCase();
    const isCompleted =
      normalizedStatus === "DONE" || normalizedStatus === "COMPLETED";

    return !isCompleted && dueDate.getTime() < startOfToday.getTime();
  }).length;
}

function computeProjectStartDateLabel(tasks) {
  const sorted = tasks
    .filter((task) => Boolean(task.startDate))
    .map((task) => new Date(task.startDate))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());

  if (!sorted.length) {
    return "-";
  }

  return formatDisplayDate(sorted[0]);
}

function computeProjectDueDateLabel(tasks) {
  const sorted = tasks
    .filter((task) => Boolean(task.dueDate))
    .map((task) => new Date(task.dueDate))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  if (!sorted.length) {
    return "-";
  }

  return formatDisplayDate(sorted[0]);
}

function getGroupLabel(item, groupBy) {
  if (groupBy === "projects") {
    return item.project || "Unspecified";
  }
  if (groupBy === "client") {
    return item.clientName || "Unspecified";
  }
  if (groupBy === "status") {
    return item.status || "Unspecified";
  }
  if (groupBy === "phase") {
    return item.phase || "Unspecified";
  }

  return item.progress || "Unspecified";
}

async function listProjects({ db, query, actorUserId, actorRole }) {
  const groupBy = normalizeGroupBy(query?.groupBy);
  const page = Number(query?.page || 1);
  const limit = Number(query?.limit || 50);
  const search = String(query?.search || "")
    .trim()
    .toLowerCase();
  const clientId = query?.clientId;

  if (!Number.isInteger(page) || page <= 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "page must be a positive integer.",
    );
  }

  if (!Number.isInteger(limit) || limit <= 0 || limit > 200) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "limit must be between 1 and 200.",
    );
  }

  let parsedClientId = null;
  if (clientId !== undefined && clientId !== null && clientId !== "") {
    parsedClientId = Number(clientId);
    if (!Number.isInteger(parsedClientId) || parsedClientId <= 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "clientId must be a positive integer.",
      );
    }
  }

  const filters = [];

  if (parsedClientId) {
    filters.push({ clientId: BigInt(parsedClientId) });
  }

  if (!isAdminRole(actorRole)) {
    filters.push(buildAssignedProjectWhere(actorUserId));
  }

  const projects = await db.clientProject.findMany({
    where: filters.length ? { AND: filters } : undefined,
    include: {
      client: {
        select: {
          id: true,
          clientName: true,
          businessName: true,
          addressLine1: true,
          addressLine2: true,
          cityState: true,
          postCode: true,
          status: true,
        },
      },
      clientSuccessManager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      tasks: {
        select: {
          id: true,
          status: true,
          startDate: true,
          dueDate: true,
        },
      },
    },
    orderBy: [{ clientId: "asc" }, { id: "asc" }],
  });

  const rows = projects
    .map((project) => {
      const clientName =
        project.client?.clientName ||
        project.client?.businessName ||
        `Client ${Number(project.clientId)}`;
      const clientAddress = [
        project.client?.addressLine1,
        project.client?.addressLine2,
        project.client?.cityState,
        project.client?.postCode,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(", ");
      const csmName =
        [
          project.clientSuccessManager?.firstName,
          project.clientSuccessManager?.lastName,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join(" ") || "-";

      return {
        id: Number(project.id),
        clientId: Number(project.clientId),
        clientName,
        clientAddress: clientAddress || "-",
        project: String(project.project || "-").trim() || "-",
        progressPercent: calculateProjectProgressPercent(project.tasks || []),
        startDateLabel: computeProjectStartDateLabel(project.tasks || []),
        dueDateLabel: computeProjectDueDateLabel(project.tasks || []),
        overdueCount: computeProjectOverdueCount(project.tasks || []),
        csm: {
          id: project.clientSuccessManager?.id
            ? Number(project.clientSuccessManager.id)
            : null,
          name: csmName,
          avatar: project.clientSuccessManager?.avatarUrl || null,
        },
        status: normalizeClientStatusLabel(project.client?.status),
        phase: String(project.phase || "-").trim() || "-",
        progress: normalizeProjectStatus(project.progress),
      };
    })
    .filter((item) => {
      if (!search) {
        return true;
      }

      const haystack = [
        item.clientName,
        item.project,
        item.status,
        item.phase,
        item.progress,
        item.csm.name,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

  const total = rows.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const pagedRows = rows.slice(start, end);

  const grouped = new Map();
  for (const row of pagedRows) {
    const label = getGroupLabel(row, groupBy);
    const current = grouped.get(label) || [];
    current.push(row);
    grouped.set(label, current);
  }

  const groups = Array.from(grouped.entries())
    .map(([label, items]) => ({
      key: label,
      label,
      count: items.length,
      items: items.sort((left, right) => {
        if (left.clientName !== right.clientName) {
          return left.clientName.localeCompare(right.clientName);
        }

        return left.project.localeCompare(right.project);
      }),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    groupBy,
    groups,
    pagination: {
      page,
      limit,
      total,
      totalPages: total > 0 ? Math.ceil(total / limit) : 1,
    },
  };
}

module.exports = {
  listProjects,
  createTask,
  updateTask,
  listTasksGroupedByProject,
  deleteTask,
  createTaskComment,
  listTaskComments,
  deleteTaskComment,
  createProjectComment,
  listProjectComments,
  deleteProjectComment,
};
