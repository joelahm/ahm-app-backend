const { AppError } = require('../../lib/errors');
const { sendNotificationEmail } = require('../../lib/mailer');
const {
  NOTIFICATION_MODULES,
  getDefaultEventToggles
} = require('./notification-event-registry');

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

const DEFAULT_CHANNELS = {
  inApp: { enabled: true },
  email: { enabled: false },
  discord: {
    defaultChannelId: '',
    enabled: false,
    useClientChannel: true
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

function mergeChannels(value) {
  const source = asObject(value);
  const inApp = asObject(source.inApp);
  const email = asObject(source.email);
  const discord = asObject(source.discord);

  return {
    inApp: {
      enabled: readBoolean(inApp.enabled, DEFAULT_CHANNELS.inApp.enabled)
    },
    email: {
      enabled: readBoolean(email.enabled, DEFAULT_CHANNELS.email.enabled)
    },
    discord: {
      defaultChannelId: asString(
        discord.defaultChannelId,
        DEFAULT_CHANNELS.discord.defaultChannelId
      ).trim(),
      enabled: readBoolean(discord.enabled, DEFAULT_CHANNELS.discord.enabled),
      useClientChannel: readBoolean(
        discord.useClientChannel,
        DEFAULT_CHANNELS.discord.useClientChannel
      )
    }
  };
}

// Build the canonical event-toggle map. Merges (in priority order):
//   1. Per-event toggles in `events` map (new shape).
//   2. Legacy `taskEvents[KEY] === false` flag (old shape) — interpreted as
//      "all channels off for this event" so legacy storage migrates cleanly.
//   3. Registry defaults.
function mergeEventToggles(rawEvents, legacyTaskEvents) {
  const newShape = asObject(rawEvents);
  const legacy = asObject(legacyTaskEvents);
  const merged = {};

  for (const module of NOTIFICATION_MODULES) {
    for (const event of module.events) {
      const stored = asObject(newShape[event.key]);
      const hasNew = Object.keys(stored).length > 0;
      const legacyValue = legacy[event.key];
      const legacyDisabled =
        legacyValue === false ||
        legacyValue === 'false' ||
        legacyValue === 0 ||
        legacyValue === '0';

      const defaults = event.defaults;

      merged[event.key] = {
        inApp: hasNew
          ? readBoolean(stored.inApp, defaults.inApp)
          : legacyDisabled
            ? false
            : defaults.inApp,
        email: hasNew
          ? readBoolean(stored.email, defaults.email)
          : legacyDisabled
            ? false
            : defaults.email,
        discord: hasNew
          ? readBoolean(stored.discord, defaults.discord)
          : legacyDisabled
            ? false
            : defaults.discord
      };
    }
  }

  return merged;
}

// Convert any accepted payload shape (response-shape with `modules`,
// flat-shape with `events`, or legacy with `taskEvents`) into a flat
// `{ key: { inApp, email, discord } }` map for storage.
function flattenEventInput(payload) {
  const source = asObject(payload);
  const flat = {};

  // Layer 1: legacy taskEvents (lowest priority).
  if (source.taskEvents && typeof source.taskEvents === 'object') {
    for (const [eventKey, value] of Object.entries(source.taskEvents)) {
      const enabled =
        value !== false &&
        value !== 'false' &&
        value !== 0 &&
        value !== '0';
      flat[eventKey] = { inApp: enabled, email: enabled, discord: enabled };
    }
  }

  // Layer 2: flat `events` map.
  if (source.events && typeof source.events === 'object') {
    for (const [eventKey, value] of Object.entries(source.events)) {
      const obj = asObject(value);
      flat[eventKey] = {
        inApp: readBoolean(obj.inApp, flat[eventKey]?.inApp ?? false),
        email: readBoolean(obj.email, flat[eventKey]?.email ?? false),
        discord: readBoolean(obj.discord, flat[eventKey]?.discord ?? false)
      };
    }
  }

  // Layer 3: response-shape `modules[].rows[]` (highest priority — what UI sends).
  const modules = Array.isArray(source.modules) ? source.modules : [];
  for (const module of modules) {
    const rows = Array.isArray(module?.rows) ? module.rows : [];
    for (const row of rows) {
      if (row && typeof row.key === 'string') {
        flat[row.key] = {
          inApp: readBoolean(row.inAppEnabled, flat[row.key]?.inApp ?? false),
          email: readBoolean(row.emailEnabled, flat[row.key]?.email ?? false),
          discord: readBoolean(row.discordEnabled, flat[row.key]?.discord ?? false)
        };
      }
    }
  }

  return flat;
}

function buildStorage(payload) {
  const source = asObject(payload);
  return {
    channels: mergeChannels(source.channels),
    events: mergeEventToggles(flattenEventInput(source), source.taskEvents)
  };
}

// Shape returned to the UI: channels at top level + modules array carrying
// registry metadata (titles/descriptions) so the page can render without
// duplicating the registry on the client.
function buildResponseSettings(storage) {
  const eventToggles = storage.events || {};
  const modules = NOTIFICATION_MODULES.map((module) => ({
    key: module.key,
    title: module.title,
    description: module.description,
    rows: module.events.map((event) => {
      const toggles = eventToggles[event.key] || event.defaults;
      return {
        key: event.key,
        title: event.title,
        description: event.description,
        inAppEnabled: !!toggles.inApp,
        emailEnabled: !!toggles.email,
        discordEnabled: !!toggles.discord
      };
    })
  }));

  return {
    channels: storage.channels,
    modules
  };
}

async function readStorage({ db }) {
  const setting = await db.appSetting.findUnique({
    where: { key: NOTIFICATION_SETTINGS_KEY },
    select: { valueJson: true }
  });

  const storage = buildStorage(setting?.valueJson);

  if (!setting) {
    await db.appSetting.create({
      data: {
        key: NOTIFICATION_SETTINGS_KEY,
        valueJson: storage
      }
    });
  }

  return storage;
}

async function getSettings({ db }) {
  const storage = await readStorage({ db });
  return { settings: buildResponseSettings(storage) };
}

async function updateSettings({ db, payload }) {
  const storage = buildStorage(payload);

  await db.appSetting.upsert({
    where: { key: NOTIFICATION_SETTINGS_KEY },
    create: {
      key: NOTIFICATION_SETTINGS_KEY,
      valueJson: storage
    },
    update: {
      valueJson: storage
    }
  });

  return { settings: buildResponseSettings(storage) };
}

function isChannelEnabledForEvent(storage, eventKey, channel) {
  const eventToggles = storage.events?.[eventKey];
  if (!eventToggles) return true; // unknown events default to allowed
  return !!eventToggles[channel];
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
    const data = asObject(notification.dataJson);
    const rawUrl = typeof data.url === 'string' ? data.url.trim() : '';
    const baseUrl = (env.invite?.baseUrl || '').replace(/\/+$/, '');
    let ctaUrl = null;
    if (rawUrl) {
      ctaUrl = /^https?:\/\//i.test(rawUrl) || !baseUrl
        ? rawUrl
        : `${baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }
    const recipientName = [recipient.firstName, recipient.lastName]
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' ')
      .trim();

    await sendNotificationEmail({
      body: notification.body,
      ctaUrl,
      env,
      name: recipientName,
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

const DISCORD_USER_ID_REGEX = /^\d{15,25}$/;

// Sends ONE Discord message per notify() call regardless of recipient count.
// All recipients of a given notify() share the same target channel (since the
// channel is derived from the entity, not the user), so the previous "one
// message per recipient" loop produced duplicate posts in busy workspaces.
// For personal scope we mention every recipient that has a valid Discord ID.
// For broadcast scope we never mention (per design).
async function deliverDiscord({ db, discordScope = 'personal', env, notification, recipients = [], settings }) {
  const discordSettings = settings.channels.discord;
  const data = asObject(notification.dataJson);
  const clientChannel = asString(data.clientDiscordChannel).trim();
  const envDefaultChannel = asString(env.integrations.discord.defaultChannelId).trim();
  // Effective fallback channel: stored setting first, then env var.
  const fallbackChannel = discordSettings.defaultChannelId || envDefaultChannel;
  const target = discordSettings.useClientChannel
    ? clientChannel || fallbackChannel
    : fallbackChannel;

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

  // Mention only on personal-scope notifications, and only for recipients
  // that have a valid Discord user ID. Invalid/missing IDs are silently
  // dropped; missing IDs never block delivery.
  const mentionIds = discordScope === 'personal'
    ? Array.from(
        new Set(
          (recipients || [])
            .map((r) => (r?.discordUserId ? String(r.discordUserId).trim() : null))
            .filter((id) => !!id && DISCORD_USER_ID_REGEX.test(id))
        )
      )
    : [];
  const mentionPrefix = mentionIds.length
    ? `${mentionIds.map((id) => `<@${id}>`).join(' ')} `
    : '';
  const allowedMentions = mentionIds.length
    ? { users: mentionIds, parse: [] }
    : { parse: [] };

  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${target}/messages`,
      {
        body: JSON.stringify({
          allowed_mentions: allowedMentions,
          content: `${mentionPrefix}**${notification.title}**\n${notification.body}`
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

async function notify({ actorUserId = null, body, category = 'OTHER', data = {}, db, discordScope = 'personal', entity = {}, env, io, recipientUserIds = [], severity = 'INFO', title, type }) {
  const storage = await readStorage({ db });

  const inAppOn = isChannelEnabledForEvent(storage, type, 'inApp');
  const emailOn = isChannelEnabledForEvent(storage, type, 'email');
  const discordOn = isChannelEnabledForEvent(storage, type, 'discord');

  if (!inAppOn && !emailOn && !discordOn) {
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
    select: { discordUserId: true, email: true, firstName: true, id: true, lastName: true }
  });
  const recipientById = new Map(recipients.map((recipient) => [Number(recipient.id), recipient]));
  const createdNotifications = [];
  const recordsForDiscord = [];

  for (const recipientId of uniqueRecipientIds) {
    if (!recipientById.has(recipientId)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // Always persist the record so email/Discord deliveries have a body
    // and stay traceable. If in-app is gated off, pre-clear so it doesn't
    // appear in the bell or affect unread counts.
    const record = await db.notification.create({
      data: {
        actorUserId: actorUserId ? BigInt(actorUserId) : null,
        body,
        category,
        clearedAt: inAppOn ? null : new Date(),
        dataJson: data,
        entityId: entity.id ? String(entity.id) : null,
        entityType: entity.type ? String(entity.type) : null,
        readAt: inAppOn ? null : new Date(),
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
      status: inAppOn ? 'SENT' : 'SKIPPED',
      target: String(recipientId)
    });

    if (emailOn) {
      await deliverEmail({
        db,
        env,
        notification: record,
        recipient: recipientById.get(recipientId)
      });
    }

    if (discordOn) {
      recordsForDiscord.push({ record, recipient: recipientById.get(recipientId) });
    }

    if (inAppOn) {
      const notification = mapNotification(record);
      const unreadCount = await getUnreadCount({ db, userId: recipientId });
      emitNotification({ io, notification, unreadCount });
      createdNotifications.push(notification);
    }
  }

  // Send a single Discord message per notify() call. The delivery row is
  // attached to the first recipient's notification record; the others get
  // a SKIPPED row noting the consolidated message so the audit trail stays
  // accurate without spamming the channel.
  if (discordOn && recordsForDiscord.length > 0) {
    const primary = recordsForDiscord[0].record;
    const allRecipients = recordsForDiscord.map((entry) => entry.recipient);
    await deliverDiscord({
      db,
      discordScope,
      env,
      notification: primary,
      recipients: allRecipients,
      settings: storage
    });

    for (let i = 1; i < recordsForDiscord.length; i += 1) {
      await createDelivery({
        channel: 'discord',
        db,
        error: `Consolidated into delivery for notification ${primary.id}.`,
        notificationId: recordsForDiscord[i].record.id,
        provider: 'discord_bot',
        status: 'SKIPPED',
        target: null
      });
    }
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

  const recipients = uniqueRecipientList([Number(task.assignedTo)], actorUserId);
  if (recipients.length === 0) {
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
    recipientUserIds: recipients,
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

  const recipients = uniqueRecipientList([Number(recipientId)], actorUserId);
  if (recipients.length === 0) {
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
    recipientUserIds: recipients,
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

async function notifyTaskAttachmentAdded({ actorUserId, attachment, db, env, io, taskId }) {
  const task = await getTaskContext({ db, taskId });

  if (!task) {
    return [];
  }

  const recipients = uniqueRecipientList([task.assignedTo, task.createdBy], actorUserId);
  if (recipients.length === 0) {
    return [];
  }

  const data = {
    ...buildTaskData(task),
    attachmentId: attachment?.id ? Number(attachment.id) : null,
    filename: attachment?.filename ?? null
  };

  return notify({
    actorUserId,
    body: `"${attachment?.filename || 'A file'}" was attached to "${task.task}".`,
    category: 'OTHER',
    data,
    db,
    discordScope: 'personal',
    entity: { id: task.id, type: 'task' },
    env,
    io,
    recipientUserIds: recipients,
    severity: 'INFO',
    title: 'Attachment added',
    type: 'TASK_ATTACHMENT_ADDED'
  });
}

async function notifyTaskChecklistItemCompleted({ actorUserId, db, env, io, item, taskId }) {
  const task = await getTaskContext({ db, taskId });

  if (!task) {
    return [];
  }

  const recipients = uniqueRecipientList([task.createdBy], actorUserId);
  if (recipients.length === 0) {
    return [];
  }

  const data = {
    ...buildTaskData(task),
    checklistItemId: item?.id ? Number(item.id) : null,
    text: item?.text ?? null
  };

  return notify({
    actorUserId,
    body: `Checklist item "${item?.text || 'item'}" was completed on "${task.task}".`,
    category: 'OTHER',
    data,
    db,
    discordScope: 'personal',
    entity: { id: task.id, type: 'task' },
    env,
    io,
    recipientUserIds: recipients,
    severity: 'INFO',
    title: 'Checklist item completed',
    type: 'TASK_CHECKLIST_ITEM_COMPLETED'
  });
}

async function notifyTaskSubtaskAssigned({ actorUserId, db, env, io, subtaskId }) {
  const subtask = await getTaskContext({ db, taskId: subtaskId });

  if (!subtask?.assignedTo) {
    return [];
  }

  const recipients = uniqueRecipientList([subtask.assignedTo], actorUserId);
  if (recipients.length === 0) {
    return [];
  }

  const data = buildTaskData(subtask);

  return notify({
    actorUserId,
    body: `You were assigned the subtask "${subtask.task}".`,
    category: 'IMPORTANT',
    data,
    db,
    discordScope: 'personal',
    entity: { id: subtask.id, type: 'task' },
    env,
    io,
    recipientUserIds: recipients,
    severity: 'INFO',
    title: 'Subtask assigned',
    type: 'TASK_SUBTASK_ASSIGNED'
  });
}

function buildClientProjectData(project) {
  const clientId = project.clientId ? Number(project.clientId) : null;
  return {
    clientDiscordChannel: project.client?.discordChannel ?? null,
    clientId,
    clientName: project.client?.businessName || project.client?.clientName || null,
    phase: project.phase ?? null,
    previousPhase: null,
    previousStartDate: null,
    progress: project.progress ?? null,
    projectId: Number(project.id),
    projectName: project.project,
    startDate: project.startDate ? new Date(project.startDate).toISOString() : null,
    url: clientId ? `/dashboard/clients/${clientId}` : null
  };
}

async function getClientProjectContext({ db, projectId }) {
  return db.clientProject.findUnique({
    where: { id: BigInt(projectId) },
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
  });
}

function uniqueRecipientList(ids, excludeUserId) {
  const exclude = excludeUserId ? Number(excludeUserId) : null;
  return Array.from(
    new Set(
      (ids || [])
        .filter((id) => id !== undefined && id !== null && id !== '')
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0 && id !== exclude)
    )
  );
}

// Used by BROADCAST-scoped events: returns every active workspace user,
// minus the actor (so people don't get notified about their own actions).
async function getWorkspaceRecipients({ db, excludeUserId }) {
  const users = await db.user.findMany({
    where: { isActive: true, status: 'ACTIVE' },
    select: { id: true }
  });
  const exclude = excludeUserId ? Number(excludeUserId) : null;
  return users
    .map((user) => Number(user.id))
    .filter((id) => Number.isInteger(id) && id > 0 && id !== exclude);
}

async function notifyProjectAssigned({ actorUserId, db, env, io, projectId, recipientUserIds, role }) {
  const recipients = uniqueRecipientList(recipientUserIds, actorUserId);
  if (recipients.length === 0) return [];

  const project = await getClientProjectContext({ db, projectId });
  if (!project) return [];

  const data = buildClientProjectData(project);
  const roleLabel = role || 'project owner';

  return notify({
    actorUserId,
    body: `You were assigned to "${project.project}" as ${roleLabel}.`,
    category: 'IMPORTANT',
    data,
    db,
    entity: { id: project.id, type: 'client_project' },
    env,
    io,
    recipientUserIds: recipients,
    severity: 'INFO',
    title: 'Project assigned',
    type: 'PROJECT_ASSIGNED'
  });
}

async function notifyProjectStatusChanged({ actorUserId, db, env, io, nextProject, previousProject }) {
  const prevPhase = previousProject?.phase ?? null;
  const nextPhase = nextProject?.phase ?? null;
  if (prevPhase === nextPhase) return [];

  // BROADCAST scope — every active workspace user, minus the actor.
  const recipients = await getWorkspaceRecipients({ db, excludeUserId: actorUserId });
  if (recipients.length === 0) return [];

  const project = await getClientProjectContext({ db, projectId: nextProject.id });
  if (!project) return [];

  const data = { ...buildClientProjectData(project), previousPhase: prevPhase };

  return notify({
    actorUserId,
    body: `"${project.project}" moved from ${prevPhase || 'Unknown'} to ${nextPhase || 'Unknown'}.`,
    category: 'OTHER',
    data,
    db,
    discordScope: 'broadcast',
    entity: { id: project.id, type: 'client_project' },
    env,
    io,
    recipientUserIds: recipients,
    severity: 'INFO',
    title: 'Project status changed',
    type: 'PROJECT_STATUS_CHANGED'
  });
}

function toIsoDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatYmd(value) {
  if (!value) return 'unset';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unset';
  return date.toISOString().slice(0, 10);
}

async function notifyProjectStartDateChanged({ actorUserId, db, env, io, nextProject, previousProject }) {
  const prevIso = toIsoDateOrNull(previousProject?.startDate);
  const nextIso = toIsoDateOrNull(nextProject?.startDate);
  if (prevIso === nextIso) return [];

  // BROADCAST scope — every active workspace user, minus the actor.
  const recipients = await getWorkspaceRecipients({ db, excludeUserId: actorUserId });
  if (recipients.length === 0) return [];

  const project = await getClientProjectContext({ db, projectId: nextProject.id });
  if (!project) return [];

  const data = { ...buildClientProjectData(project), previousStartDate: prevIso };

  return notify({
    actorUserId,
    body: `"${project.project}" start date changed from ${formatYmd(prevIso)} to ${formatYmd(nextIso)}.`,
    category: 'OTHER',
    data,
    db,
    discordScope: 'broadcast',
    entity: { id: project.id, type: 'client_project' },
    env,
    io,
    recipientUserIds: recipients,
    severity: 'INFO',
    title: 'Project start date changed',
    type: 'PROJECT_START_DATE_CHANGED'
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
  notifyProjectAssigned,
  notifyProjectStartDateChanged,
  notifyProjectStatusChanged,
  notifyTaskAttachmentAdded,
  notifyTaskAssigned,
  notifyTaskChecklistItemCompleted,
  notifyTaskCommentCreated,
  notifyTaskStatusChanged,
  notifyTaskSubtaskAssigned,
  updateSettings
};
