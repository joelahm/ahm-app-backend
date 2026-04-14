const express = require('express');
const usersController = require('./users.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const { requirePermission } = require('../../middleware/requirePermission');
const { uploadAvatar, handleAvatarUploadError } = require('../../middleware/uploadAvatar');

const router = express.Router();

router.use(authenticateAccessToken);

// Self-service profile update for authenticated users.
router.patch('/me', uploadAvatar.single('avatar'), handleAvatarUploadError, usersController.patchMe);
router.patch('/me/password', usersController.patchMyPassword);

router.get('/permissions', requireRole('ADMIN'), usersController.getPermissionsSettings);
router.patch('/permissions', requireRole('ADMIN'), usersController.patchPermissionsSettings);
router.get('/', requireRole('ADMIN'), usersController.listUsers);
router.get('/pending-invitations', requireRole('ADMIN'), usersController.listPendingInvitations);
router.post('/', requirePermission('add-new-user'), usersController.createUser);
router.post('/invite', requirePermission('add-new-user'), usersController.inviteUsers);
router.patch('/:id', requireRole('ADMIN'), usersController.patchUser);
router.patch('/:id/role', requirePermission('change-user-role'), usersController.patchUserRole);
router.patch('/:id/password', requireRole('ADMIN'), usersController.patchPassword);
router.patch(
  '/:id/avatar',
  requireRole('ADMIN'),
  uploadAvatar.single('avatar'),
  handleAvatarUploadError,
  usersController.patchAvatar
);
router.post('/:id/delete', requirePermission('remove-user'), usersController.deleteUser);
router.patch('/:id/delete', requirePermission('remove-user'), usersController.deleteUser);
router.delete('/:id', requirePermission('remove-user'), usersController.deleteUser);

module.exports = { usersRouter: router };
