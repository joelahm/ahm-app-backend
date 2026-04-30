const { AppError } = require('../../lib/errors');
const { sendNotificationEmail } = require('../../lib/mailer');

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

const DEFAULT_NOTIFICATION_SETTINGS = {
  channels: {
    inApp: { enabled: true },
    email: { enabled: false },
    discord: {
      defaultChannelId: '',
      enabled: false,
      useClientChannel: true
    }
  },
  taskEvents: {
    TASK_ASSIGNED: true,
    TASK_COMMENT_CREATED: true,
    TASK_COMPLETED: true,
    TASK_STATUS_CHANGED: true
  }
};

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  return fallback;
}

function mergeNotificationSettings(value) {
  const source = asObject(value);
  const channels = asObject(source.channels);
  const inApp = asObject(channels.inApp);
  const email = asObject(channels.email);
  const discord = asObject(channels.discord);
  const taskEvents = asObject(source.taskEvents);

  return {
    channels: {
      inApp: {
        enabled: readBoolean(
          inApp.enabled,
          DEFAULT_NOTIFICATION_SETTINGS.channels.inApp.enabled
        )
      },
      email: {
        enabled: readBoolean(
          email.enabled,
          DEFAULT_NOTIFICATION_SETTINGS.channels.email.enabled
        )
      },
      discord: {
        defaultChannelId: asString(
          discord.defaultChannelId,
          DEFAULT_NOTIFICATION_SETTINGS.channels.discord.defaultChannelId
        ).trim(),
        enabled: readBoolean(
          discord.enabled,
          DEFAULT_NOTIFICATION_SETTINGS.channels.discord.enabled
        ),
        useClientChannel: readBoolean(
          discord.useClientChannel,
          DEFAULT_NOTIFICATION_SETTINGS.channels.discord.useClientChannel
        )
      }
    },
    taskEvents: {
      TASK_ASSIGNED: readBoolean(
        taskEvents.TASK_ASSIGNED,
        DEFAULT_NOTIFICATION_SETTINGS.taskEvents.TASK_ASSIGNED
      ),
      TASK_COMMENT_CREATED: readBoolean(
        taskEvents.TASK_COMMENT_CREATED,
        DEFAULT_NOTIFICATION_SETTINGS.taskEvents.TASK_COMMENT_CREATED
      ),
      TASK_COMPLETED: readBoolean(
        taskEvents.TASK_COMPLETED,
        DEFAULT_NOTIFICATION_SETTINGS.taskEvents.TASK_COMPLETED
      ),
      TASK_STATUS_CHANGED: readBoolean(
        taskEvents.TASK_STATUS_CHANGED,
        DEFAULT_NOTIFICATION_SETTINGS.taskEvents.TASK_STATUS_CHANGED
      )
    }
  };
}

async function getSettings({ db }) {
  const setting = await db.appSetting.findUnique({
    where: { key: NOTIFICATION_SETTINGS_KEY },
    select: { valueJson: true }
  });

  const settings = mergeNotificationSettings(setting?.valueJson);

  if (!setting) {
    await db.appSetting.create({
      data: {
        key: NOTIFICATION_SETTINGS_KEY,
        valueJson: settings
      }
    });
  }

  return { settings };
}

async function updateSettings({ db, payload }) {
  const settings = mergeNotificationSettings(payload);

  await db.appSetting.upsert({
    where: { key: NOTIFICATION_SETTINGS_KEY },
    create: {
      key: NOTIFICATION_SETTINGS_KEY,
      valueJson: settings
    },
    update: {
      valueJson: settings
    }
  });

  return { settings };
}

function mapActor(actor) {
  if (!actor) return null;

  const fullName = [actor.firstName, actor.lastName]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .trim();

  return {
    avatarUrl: actor.avatarUrl ?? null,
    email: actor.email,
    id: Number(actor.id),
    name: fullName || actor.email
  };
}

function mapNotification(record) {
  return {
    actor: mapActor(record.actor),
    actorUserId: record.actorUserId ? Number(record.actorUserId) : null,
    body: record.body,
    category: record.category,
    clearedAt: record.clearedAt ? record.clearedAt.toISOString() : null,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    data: record.dataJson || null,
    entityId: record.entityId,
    entityType: record.entityType,
    id: String(record.id),
    isRead: Boolean(record.readAt),
    readAt: record.readAt ? record.readAt.toISOString() : null,
    recipientUserId: Number(record.recipientUserId),
    severity: record.severity,
    title: record.title,
    type: record.type,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : String(record.updatedAt)
  };
}

async function getUnreadCount({ db, userId }) {
  return db.notification.count({
    where: {
      clearedAt: null,
      readAt: null,
      recipientUserId: BigInt(userId)
    }
  });
}

async function listNotifications({ db, query, userId }) {
  const tab = asString(query.tab || 'active').trim().toLowerCase();
  const take = Math.min(Math.max(Number(query.limit || 50), 1), 100);
  const where = {
    recipientUserId: BigInt(userId),
    ...(tab === 'cleared' ? { clearedAt: { not: null } } : { clearedAt: null }),
    ...(tab === 'important' ? { category: 'IMPORTANT' } : {}),
    ...(tab === 'other' ? { category: 'OTHER' } : {})
  };

  const [records, unreadCount] = await Promise.all([
    db.notification.findMany({
      include: {
        actor: {
          select: {
            avatarUrl: true,
            email: true,
            firstName: true,
            id: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take,
      where
    }),
    getUnreadCount({ db, userId })
  ]);

  return {
    notifications: records.map(mapNotification),
    total: records.length,
    unreadCount
  };
}

async function markNotificationRead({ db, notificationId, userId }) {
  const record = await db.notification.updateMany({
    where: {
      id: BigInt(notificationId),
      recipientUserId: BigInt(userId)
    },
    data: { readAt: new Date() }
  });

  if (record.count === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  }

  return { success: true, unreadCount: await getUnreadCount({ db, userId }) };
}

async function clearNotification({ db, notificationId, userId }) {
  const record = await db.notification.updateMany({
    where: {
      id: BigInt(notificationId),
      recipientUserId: BigInt(userId)
    },
    data: {
      clearedAt: new Date(),
      readAt: new Date()
    }
  });

  if (record.count === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  }

  return { success: true, unreadCount: await getUnreadCount({ db, userId }) };
}

async function markAllRead({ db, userId }) {
  await db.notification.updateMany({
    where: {
      clearedAt: null,
      readAt: null,
      recipientUserId: BigInt(userId)
    },
    data: { readAt: new Date() }
  });

  return { success: true, unreadCount: 0 };
}

function emitNotification({ io, notification, unreadCount }) {
  if (!io || !notification?.recipientUserId) {
    return;
  }

  io.to(`user:${notification.recipientUserId}`).emit('notification:new', {
    notification,
    unreadCount
  });
  io.to(`user:${notification.recipientUserId}`).emit('notification:count', {
    unreadCount
  });
}

async function createDelivery({ channel, db, error = null, notificationId, provider, status, target = null }) {
  return db.notificationDelivery.create({
    data: {
      attemptCount: status === 'SENT' || status === 'FAILED' ? 1 : 0,
      channel,
      lastError: error,
      notificationId: BigInt(notificationId),
      provider,
      sentAt: status === 'SENT' ? new Date() : null,
      status,
      target
    }
  });
}

async function deliverEmail({ db, env, notification, recipient }) {
  if (!recipient?.email) {
    await createDelivery({
      channel: 'email',
      db,
      error: 'Recipient email is missing.',
      notificationId: notification.id,
      provider: 'smtp',
      status: 'SKIPPED'
    });
    return;
  }

  try {
    await sendNotificationEmail({
      body: notification.body,
      env,
      title: notification.title,
      to: recipient.email
    });
    await createDelivery({
      channel: 'email',
      db,
      notificationId: notification.id,
      provider: 'smtp',
      status: 'SENT',
      target: recipient.email
    });
  } catch (err) {
    await createDelivery({
      channel: 'email',
      db,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
      notificationId: notification.id,
      provider: 'smtp',
      status: 'FAILED',
      target: recipient.email
    });
  }
}

async function deliverDiscord({ db, env, notification, settings }) {
  const discordSettings = settings.channels.discord;
  const data = asObject(notification.dataJson);
  const clientChannel = asString(data.clientDiscordChannel).trim();
  const target = discordSettings.useClientChannel
    ? clientChannel || discordSettings.defaultChannelId
    : discordSettings.defaultChannelId;

  if (!env.integrations.discord.botToken || !target) {
    await createDelivery({
      channel: 'discord',
      db,
      error: !env.integrations.discord.botToken
        ? 'Discord bot token is not configured.'
        : 'Discord target channel is not configured.',
      notificationId: notification.id,
      provider: 'discord_bot',
      status: 'SKIPPED',
      target: target || null
    });
    return;
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${target}/messages`,
      {
        body: JSON.stringify({
          allowed_mentions: { parse: [] },
          content: `**${notification.title}**\n${notification.body}`
        }),
        headers: {
          Authorization: `Bot ${env.integrations.discord.botToken}`,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      }
    );

    if (!response.ok) {
      throw new Error(`Discord API returned ${response.status}.`);
    }

    await createDelivery({
      channel: 'discord',
      db,
      notificationId: notification.id,
      provider: 'discord_bot',
      status: 'SENT',
      target
    });
  } catch (err) {
    await createDelivery({
      channel: 'discord',
      db,
      error: err instanceof Error ? err.message : 'Discord delivery failed.',
      notificationId: notification.id,
      provider: 'discord_bot',
      status: 'FAILED',
      target
    });
  }
}

async function notify({ actorUserId = null, body, category = 'OTHER', data = {}, db, entity = {}, env, io, recipientUserIds = [], severity = 'INFO', title, type }) {
  const settings = (await getSettings({ db })).settings;

  if (settings.taskEvents[type] === false) {
    return [];
  }

  const uniqueRecipientIds = Array.from(
    new Set(
      recipientUserIds
        .filter((id) => id !== undefined && id !== null && id !== '')
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  if (uniqueRecipientIds.length === 0) {
    return [];
  }

  const recipients = await db.user.findMany({
    where: {
      id: { in: uniqueRecipientIds.map((id) => BigInt(id)) },
      isActive: true,
      status: 'ACTIVE'
    },
    select: { email: true, id: true }
  });
  const recipientById = new Map(recipients.map((recipient) => [Number(recipient.id), recipient]));
  const createdNotifications = [];

  for (const recipientId of uniqueRecipientIds) {
    if (!recipientById.has(recipientId)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const record = await db.notification.create({
      data: {
        actorUserId: actorUserId ? BigInt(actorUserId) : null,
        body,
        category,
        dataJson: data,
        entityId: entity.id ? String(entity.id) : null,
        entityType: entity.type ? String(entity.type) : null,
        recipientUserId: BigInt(recipientId),
        severity,
        title,
        type
      },
      include: {
        actor: {
          select: {
            avatarUrl: true,
            email: true,
            firstName: true,
            id: true,
            lastName: true
          }
        }
      }
    });

    await createDelivery({
      channel: 'in_app',
      db,
      notificationId: record.id,
      provider: 'database',
      status: 'SENT',
      target: String(recipientId)
    });

    if (settings.channels.email.enabled) {
      await deliverEmail({
        db,
        env,
        notification: record,
        recipient: recipientById.get(recipientId)
      });
    }

    if (settings.channels.discord.enabled) {
      await deliverDiscord({ db, env, notification: record, settings });
    }

    const notification = mapNotification(record);
    const unreadCount = await getUnreadCount({ db, userId: recipientId });
    emitNotification({ io, notification, unreadCount });
    createdNotifications.push(notification);
  }

  return createdNotifications;
}

function buildTaskUrl(task) {
  const clientId = task.project?.clientId ? Number(task.project.clientId) : null;

  if (!clientId) {
    return null;
  }

  return `/dashboard/clients/${clientId}/task-lists?taskId=${Number(task.id)}`;
}

async function getTaskContext({ db, taskId }) {
  return db.projectTask.findUnique({
    where: { id: BigInt(taskId) },
    include: {
      project: {
        include: {
          client: {
            select: {
              businessName: true,
              clientName: true,
              discordChannel: true,
              id: true
            }
          }
        }
      }
    }
  });
}

function buildTaskData(task) {
  return {
    clientDiscordChannel: task.project?.client?.discordChannel ?? null,
    clientId: task.project?.clientId ? Number(task.project.clientId) : null,
    clientName: task.project?.client?.businessName || task.project?.client?.clientName || null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    projectId: Number(task.projectId),
    projectName: task.project?.project || task.project?.projectName || null,
    status: task.status,
    taskId: Number(task.id),
    taskName: task.task,
    url: buildTaskUrl(task)
  };
}

async function notifyTaskAssigned({ actorUserId, db, env, io, taskId }) {
  const task = await getTaskContext({ db, taskId });

  if (!task?.assignedTo) {
    return [];
  }

  const data = buildTaskData(task);

  return notify({
    actorUserId,
    body: `You were assigned "${task.task}".`,
    category: 'IMPORTANT',
    data,
    db,
    entity: { id: task.id, type: 'task' },
    env,
    io,
    recipientUserIds: [Number(task.assignedTo)],
    severity: 'INFO',
    title: 'Task assigned',
    type: 'TASK_ASSIGNED'
  });
}

async function notifyTaskStatusChanged({ actorUserId, db, env, io, nextTask, previousTask }) {
  const recipientId = nextTask?.assignedTo ?? nextTask?.assignedToId ?? null;

  if (!recipientId || previousTask?.status === nextTask.status) {
    return [];
  }

  const task = await getTaskContext({ db, taskId: nextTask.id });
  if (!task) {
    return [];
  }

  const isCompleted = String(task.status || '').trim().toLowerCase() === 'completed';
  const data = {
    ...buildTaskData(task),
    previousStatus: previousTask?.status ?? null
  };

  return notify({
    actorUserId,
    body: `"${task.task}" moved from ${previousTask?.status || 'Unknown'} to ${task.status}.`,
    category: isCompleted ? 'IMPORTANT' : 'OTHER',
    data,
    db,
    entity: { id: task.id, type: 'task' },
    env,
    io,
    recipientUserIds: [Number(recipientId)],
    severity: isCompleted ? 'SUCCESS' : 'INFO',
    title: isCompleted ? 'Task completed' : 'Task status changed',
    type: isCompleted ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED'
  });
}

async function notifyTaskCommentCreated({ actorUserId, comment, db, env, io, taskId }) {
  const task = await getTaskContext({ db, taskId });

  if (!task) {
    return [];
  }

  const recipientIds = [task.assignedTo, task.createdBy]
    .filter(Boolean)
    .map((id) => Number(id))
    .filter((id) => id !== Number(actorUserId));

  if (recipientIds.length === 0) {
    return [];
  }

  const data = {
    ...buildTaskData(task),
    commentId: comment?.id ? Number(comment.id) : null
  };

  return notify({
    actorUserId,
    body: `A new comment was added to "${task.task}".`,
    category: 'OTHER',
    data,
    db,
    entity: { id: task.id, type: 'task' },
    env,
    io,
    recipientUserIds: recipientIds,
    severity: 'INFO',
    title: 'New task comment',
    type: 'TASK_COMMENT_CREATED'
  });
}

module.exports = {
  clearNotification,
  getSettings,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markNotificationRead,
  notify,
  notifyTaskAssigned,
  notifyTaskCommentCreated,
  notifyTaskStatusChanged,
  updateSettings
};
