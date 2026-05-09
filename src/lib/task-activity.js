const TASK_ACTIVITY_TYPES = {
  ASSIGNEE_CHANGED: 'ASSIGNEE_CHANGED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED: 'ATTACHMENT_REMOVED',
  CHECKLIST_CREATED: 'CHECKLIST_CREATED',
  CHECKLIST_DELETED: 'CHECKLIST_DELETED',
  CHECKLIST_ITEM_COMPLETED: 'CHECKLIST_ITEM_COMPLETED',
  CHECKLIST_ITEM_REOPENED: 'CHECKLIST_ITEM_REOPENED',
  DUE_DATE_CHANGED: 'DUE_DATE_CHANGED',
  PARENT_CHANGED: 'PARENT_CHANGED',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SUBTASK_ADDED: 'SUBTASK_ADDED'
};

async function recordTaskActivity({ actorUserId, db, metadata, taskId, type }) {
  try {
    if (!db || !taskId || !type) return;

    await db.taskActivity.create({
      data: {
        taskId: BigInt(taskId),
        actorUserId: actorUserId ? BigInt(actorUserId) : null,
        type,
        metadataJson: metadata || undefined
      }
    });
  } catch (err) {
    console.error('[task-activity] Failed to record task activity.', err);
  }
}

module.exports = {
  TASK_ACTIVITY_TYPES,
  recordTaskActivity
};
