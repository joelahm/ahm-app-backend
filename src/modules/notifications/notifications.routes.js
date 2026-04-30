const express = require('express');
const notificationsController = require('./notifications.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);

router.get('/', notificationsController.listNotifications);
router.get('/count', notificationsController.getUnreadCount);
router.post('/read-all', notificationsController.markAllRead);
router.patch('/:id/read', notificationsController.markNotificationRead);
router.patch('/:id/clear', notificationsController.clearNotification);
router.get('/settings', requireRole('ADMIN'), notificationsController.getSettings);
router.patch('/settings', requireRole('ADMIN'), notificationsController.updateSettings);

module.exports = { notificationsRouter: router };
