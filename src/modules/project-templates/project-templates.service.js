const { randomUUID } = require('crypto');
const { AppError } = require('../../lib/errors');

const PROJECT_TEMPLATES_SETTINGS_KEY = 'project_templates';
const PROJECT_TEMPLATE_STATUS_OPTIONS_SETTINGS_KEY = 'project_template_status_options';
const DEFAULT_TEMPLATE_STATUSES = [
  'Onboarding',
  'Planning',
  'Implementation',
  'On hold',
  'Closed',
  'Cancelled'
];

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function buildUserDisplayName(user) {
  const firstName = asString(user?.firstName).trim();
  const lastName = asString(user?.lastName).trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || asString(user?.email) || 'Unknown';
}

function normalizeTask(value, index) {
  const source = asObject(value);
  const taskName = asString(source.taskName || source.title).trim();
  const labels = Array.isArray(source.labels)
    ? source.labels
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim())
    : (asString(source.label).trim() ? [asString(source.label).trim()] : []);

  return {
    id: asString(source.id) || `task-${index + 1}`,
    taskName: taskName || `Task ${index + 1}`,
    taskDescription: asString(source.taskDescription || source.description) || '-',
    level: Math.max(0, Math.min(2, asNumber(source.level, 0))),
    labels,
    dependency: asString(source.dependency) || '-',
    dueDateTrigger: asString(source.dueDateTrigger) || 'On trigger date',
    isExpanded: asBoolean(source.isExpanded),
    isSelected: asBoolean(source.isSelected),
    assigneeId: asString(source.assigneeId),
    assigneeName: asString(source.assigneeName),
    status: asString(source.status),
    parentTaskId: asString(source.parentTaskId),
    blockedTaskId: asString(source.blockedTaskId),
    enableDependency: asBoolean(source.enableDependency),
    dependencyType: asString(source.dependencyType),
    title: taskName || `Task ${index + 1}`
  };
}

function normalizeStoredProjectTemplate(value) {
  const source = asObject(value);
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map((task, index) => normalizeTask(task, index))
    : [];
  const createdBy = asObject(source.createdBy);

  return {
    id: asString(source.id) || `template-${randomUUID()}`,
    projectName: asString(source.projectName),
    description: asString(source.description),
    status: asString(source.status),
    tasks,
    totalTasks: tasks.length,
    createdAt: asString(source.createdAt) || new Date().toISOString(),
    updatedAt:
      asString(source.updatedAt) ||
      asString(source.createdAt) ||
      new Date().toISOString(),
    createdBy: {
      id: asNumber(createdBy.id, 0),
      name: asString(createdBy.name),
      email: asString(createdBy.email)
    }
  };
}

function parseStoredProjectTemplatesValue(value) {
  const root = asObject(value);
  const rawTemplates = Array.isArray(root.projectTemplates)
    ? root.projectTemplates
    : [];

  return {
    projectTemplates: rawTemplates
      .map((item) => normalizeStoredProjectTemplate(item))
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )
  };
}

function normalizeStatusOptionsValue(value) {
  const source = asObject(value);
  const rawOptions = Array.isArray(source.statusOptions)
    ? source.statusOptions
    : Array.isArray(source.options)
      ? source.options
      : [];

  const options = rawOptions
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      const itemSource = asObject(item);
      return asString(itemSource.label || itemSource.value || itemSource.name).trim();
    })
    .filter(Boolean)
    .filter((item, index, current) => current.indexOf(item) === index);

  return options.length ? options : DEFAULT_TEMPLATE_STATUSES;
}

async function persistProjectTemplateStatusOptions({ db, statusOptions }) {
  const valueJson = { statusOptions };

  await db.appSetting.upsert({
    where: { key: PROJECT_TEMPLATE_STATUS_OPTIONS_SETTINGS_KEY },
    create: {
      key: PROJECT_TEMPLATE_STATUS_OPTIONS_SETTINGS_KEY,
      valueJson
    },
    update: {
      valueJson
    }
  });
}

async function getProjectTemplateStatusOptions({ db }) {
  const setting = await db.appSetting.findUnique({
    where: { key: PROJECT_TEMPLATE_STATUS_OPTIONS_SETTINGS_KEY }
  });
  const statusOptions = normalizeStatusOptionsValue(setting?.valueJson);

  if (!setting) {
    await persistProjectTemplateStatusOptions({ db, statusOptions });
  }

  return { statusOptions };
}

async function normalizeCreateProjectTemplatePayload({ db, payload }) {
  const source = asObject(payload);
  const projectName = asString(source.projectName).trim();
  const status = asString(source.status).trim();

  if (!projectName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Project name is required.');
  }

  const { statusOptions } = await getProjectTemplateStatusOptions({ db });

  if (!status || !statusOptions.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project template status.');
  }

  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map((task, index) => normalizeTask(task, index))
    : [];

  return {
    projectName,
    description: asString(source.description),
    status,
    tasks
  };
}

function mapProjectTemplateRecord(record) {
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map((task, index) => normalizeTask(task, index))
    : [];

  return {
    id: asString(record.id),
    projectName: asString(record.projectName),
    description: asString(record.description),
    status: asString(record.status),
    tasks,
    totalTasks: tasks.length,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : asString(record.createdAt),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : asString(record.updatedAt),
    createdBy: {
      id: record.creator?.id ? Number(record.creator.id) : 0,
      name: buildUserDisplayName(record.creator),
      email: asString(record.creator?.email)
    }
  };
}

async function migrateLegacyProjectTemplatesIfNeeded({ db }) {
  const currentCount = await db.projectTemplate.count();

  if (currentCount > 0) {
    return;
  }

  const setting = await db.appSetting.findUnique({
    where: { key: PROJECT_TEMPLATES_SETTINGS_KEY }
  });

  if (!setting) {
    return;
  }

  const legacyTemplates = parseStoredProjectTemplatesValue(setting.valueJson).projectTemplates;

  if (!legacyTemplates.length) {
    return;
  }

  for (const template of legacyTemplates) {
    let createdBy = null;
    const createdById = template.createdBy?.id;

    if (Number.isFinite(createdById) && createdById > 0) {
      const creator = await db.user.findUnique({
        where: { id: BigInt(createdById) },
        select: { id: true }
      });
      createdBy = creator ? BigInt(createdById) : null;
    }

    await db.projectTemplate.upsert({
      where: { id: template.id },
      create: {
        id: template.id,
        projectName: template.projectName,
        description: template.description,
        status: template.status,
        tasks: template.tasks,
        createdBy,
        createdAt: new Date(template.createdAt),
        updatedAt: new Date(template.updatedAt)
      },
      update: {
        projectName: template.projectName,
        description: template.description,
        status: template.status,
        tasks: template.tasks,
        createdBy,
        createdAt: new Date(template.createdAt),
        updatedAt: new Date(template.updatedAt)
      }
    });
  }
}

async function getProjectTemplates({ db }) {
  await migrateLegacyProjectTemplatesIfNeeded({ db });

  const projectTemplates = await db.projectTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  return {
    projectTemplates: projectTemplates.map((record) => mapProjectTemplateRecord(record))
  };
}

async function createProjectTemplate({ db, actorUserId, payload }) {
  await migrateLegacyProjectTemplatesIfNeeded({ db });
  const normalizedPayload = await normalizeCreateProjectTemplatePayload({ db, payload });
  const createdBy = actorUserId ? BigInt(actorUserId) : null;

  const projectTemplate = await db.projectTemplate.create({
    data: {
      id: `template-${randomUUID()}`,
      projectName: normalizedPayload.projectName,
      description: normalizedPayload.description,
      status: normalizedPayload.status,
      tasks: normalizedPayload.tasks,
      createdBy
    },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  return {
    success: true,
    projectTemplate: mapProjectTemplateRecord(projectTemplate)
  };
}

async function deleteProjectTemplate({ db, templateId }) {
  await migrateLegacyProjectTemplatesIfNeeded({ db });

  const existingTemplate = await db.projectTemplate.findUnique({
    where: { id: templateId },
    select: { id: true }
  });

  if (!existingTemplate) {
    throw new AppError(404, 'NOT_FOUND', 'Project template not found.');
  }

  await db.projectTemplate.delete({
    where: { id: templateId }
  });

  return {
    success: true,
    projectTemplate: { id: templateId }
  };
}

async function updateProjectTemplate({ db, templateId, payload }) {
  await migrateLegacyProjectTemplatesIfNeeded({ db });
  const normalizedPayload = await normalizeCreateProjectTemplatePayload({ db, payload });

  const existingTemplate = await db.projectTemplate.findUnique({
    where: { id: templateId },
    select: { id: true }
  });

  if (!existingTemplate) {
    throw new AppError(404, 'NOT_FOUND', 'Project template not found.');
  }

  const projectTemplate = await db.projectTemplate.update({
    where: { id: templateId },
    data: {
      projectName: normalizedPayload.projectName,
      description: normalizedPayload.description,
      status: normalizedPayload.status,
      tasks: normalizedPayload.tasks
    },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  return {
    success: true,
    projectTemplate: mapProjectTemplateRecord(projectTemplate)
  };
}

module.exports = {
  getProjectTemplates,
  getProjectTemplateStatusOptions,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate
};
