const notificationsService = require('./notifications.service');

async function listNotifications(req, res, next) {
  try {
    const data = await notificationsService.listNotifications({
      db: req.app.locals.db,
      query: req.query || {},
      userId: req.auth.userId
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const unreadCount = await notificationsService.getUnreadCount({
      db: req.app.locals.db,
      userId: req.auth.userId
    });

    res.status(200).json({ unreadCount });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const data = await notificationsService.markNotificationRead({
      db: req.app.locals.db,
      notificationId: req.params.id,
      userId: req.auth.userId
    });

    req.app.locals.io?.to(`user:${req.auth.userId}`).emit('notification:count', {
      unreadCount: data.unreadCount
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function clearNotification(req, res, next) {
  try {
    const data = await notificationsService.clearNotification({
      db: req.app.locals.db,
      notificationId: req.params.id,
      userId: req.auth.userId
    });

    req.app.locals.io?.to(`user:${req.auth.userId}`).emit('notification:count', {
      unreadCount: data.unreadCount
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const data = await notificationsService.markAllRead({
      db: req.app.locals.db,
      userId: req.auth.userId
    });

    req.app.locals.io?.to(`user:${req.auth.userId}`).emit('notification:count', {
      unreadCount: data.unreadCount
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const data = await notificationsService.getSettings({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const data = await notificationsService.updateSettings({
      db: req.app.locals.db,
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  clearNotification,
  getSettings,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markNotificationRead,
  updateSettings
};
