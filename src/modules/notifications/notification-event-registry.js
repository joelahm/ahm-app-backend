const NOTIFICATION_MODULES = [
  {
    key: 'tasks',
    title: 'Tasks',
    description: 'Notifications about tasks within projects.',
    events: [
      {
        key: 'TASK_ASSIGNED',
        title: 'Task assigned',
        description: 'When a task is assigned to you.',
        defaults: { inApp: true, email: false, discord: false }
      },
      {
        key: 'TASK_STATUS_CHANGED',
        title: 'Task status changed',
        description: 'When the status of a task you own changes.',
        defaults: { inApp: true, email: false, discord: false }
      },
      {
        key: 'TASK_COMPLETED',
        title: 'Task completed',
        description: 'When a task you own is marked completed.',
        defaults: { inApp: true, email: false, discord: false }
      },
      {
        key: 'TASK_COMMENT_CREATED',
        title: 'Task comment',
        description: 'When someone comments on a task involving you.',
        defaults: { inApp: true, email: false, discord: false }
      },
      {
        key: 'TASK_DUE_TOMORROW',
        title: 'Task due tomorrow',
        description: 'Reminder for tasks assigned to you that are due the next day.',
        defaults: { inApp: true, email: true, discord: false }
      },
      {
        key: 'TASK_SUMMARY',
        title: 'Task summary',
        description: 'Periodic digest of your overdue, due-today, and recently completed tasks.',
        defaults: { inApp: false, email: true, discord: false }
      }
    ]
  },
  {
    key: 'projects',
    title: 'Projects',
    description: 'Project assignments and lifecycle changes.',
    events: [
      {
        key: 'PROJECT_ASSIGNED',
        title: 'Project assigned',
        description: 'When a project is assigned to you as CSM or Account Manager.',
        defaults: { inApp: true, email: true, discord: false }
      },
      {
        key: 'PROJECT_STATUS_CHANGED',
        title: 'Project status changed',
        description: 'When the status of a project you own changes.',
        defaults: { inApp: true, email: false, discord: false }
      },
      {
        key: 'PROJECT_START_DATE_CHANGED',
        title: 'Project start date changed',
        description: 'When a project you own has its start date updated.',
        defaults: { inApp: true, email: false, discord: false }
      }
    ]
  },
  {
    key: 'users',
    title: 'Users & access',
    description: 'Account, invites, and role changes.',
    events: [
      {
        key: 'USER_INVITED',
        title: 'User invited',
        description: 'A new user has been invited to the workspace.',
        defaults: { inApp: true, email: true, discord: false }
      },
      {
        key: 'USER_JOINED',
        title: 'User joined',
        description: 'An invited user accepted and joined the workspace.',
        defaults: { inApp: false, email: false, discord: true }
      },
      {
        key: 'USER_ROLE_CHANGED',
        title: 'Role changed',
        description: 'A user role was changed.',
        defaults: { inApp: true, email: true, discord: false }
      },
      {
        key: 'USER_PASSWORD_CHANGED',
        title: 'Password changed',
        description: 'Your account password was changed.',
        defaults: { inApp: true, email: true, discord: false }
      }
    ]
  },
  {
    key: 'clients',
    title: 'Clients',
    description: 'Client lifecycle and integration health.',
    events: [
      {
        key: 'CLIENT_CREATED',
        title: 'Client created',
        description: 'A new client was added to the workspace.',
        defaults: { inApp: true, email: false, discord: true }
      },
      {
        key: 'CLIENT_ASSIGNED',
        title: 'Client assigned',
        description: 'A client was assigned to you.',
        defaults: { inApp: true, email: true, discord: false }
      },
      {
        key: 'CLIENT_DEACTIVATED',
        title: 'Client deactivated',
        description: 'A client was deactivated in the workspace.',
        defaults: { inApp: true, email: true, discord: true }
      }
    ]
  },
  {
    key: 'scans',
    title: 'Scans',
    description: 'Scan runs and outcomes.',
    events: [
      {
        key: 'SCAN_COMPLETED',
        title: 'Scan completed',
        description: 'A scan you triggered or scheduled finished successfully.',
        defaults: { inApp: true, email: false, discord: false }
      },
      {
        key: 'SCAN_FAILED',
        title: 'Scan failed',
        description: 'A scan run failed.',
        defaults: { inApp: true, email: true, discord: true }
      },
      {
        key: 'SCAN_CRITICAL_ISSUE',
        title: 'Critical issue found',
        description: 'A scan detected a critical issue requiring attention.',
        defaults: { inApp: true, email: true, discord: true }
      }
    ]
  },
  {
    key: 'comments',
    title: 'Comments',
    description: 'Mentions and replies across the workspace.',
    events: [
      {
        key: 'COMMENT_MENTION',
        title: 'You were mentioned',
        description: 'When someone @mentions you in a comment.',
        defaults: { inApp: true, email: true, discord: false }
      }
    ]
  }
];

function getAllEventKeys() {
  const keys = [];
  for (const module of NOTIFICATION_MODULES) {
    for (const event of module.events) {
      keys.push(event.key);
    }
  }
  return keys;
}

function findEvent(eventKey) {
  for (const module of NOTIFICATION_MODULES) {
    for (const event of module.events) {
      if (event.key === eventKey) {
        return { module, event };
      }
    }
  }
  return null;
}

function getDefaultEventToggles() {
  const map = {};
  for (const module of NOTIFICATION_MODULES) {
    for (const event of module.events) {
      map[event.key] = { ...event.defaults };
    }
  }
  return map;
}

module.exports = {
  NOTIFICATION_MODULES,
  findEvent,
  getAllEventKeys,
  getDefaultEventToggles
};
