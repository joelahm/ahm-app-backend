const express = require('express');
const usersController = require('./users.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');
const { uploadAvatar, handleAvatarUploadError } = require('../../middleware/uploadAvatar');

const router = express.Router();

router.use(authenticateAccessToken);

// Self-service profile update for authenticated users.
router.patch('/me', uploadAvatar.single('avatar'), handleAvatarUploadError, usersController.patchMe);
router.patch('/me/password', usersController.patchMyPassword);

router.use(requireRole('ADMIN'));

router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);
router.post('/invite', usersController.inviteUsers);
router.patch('/:id', usersController.patchUser);
router.patch('/:id/role', usersController.patchUserRole);
router.patch('/:id/password', usersController.patchPassword);
router.patch('/:id/avatar', uploadAvatar.single('avatar'), handleAvatarUploadError, usersController.patchAvatar);
router.post('/:id/delete', usersController.deleteUser);
router.patch('/:id/delete', usersController.deleteUser);
router.delete('/:id', usersController.deleteUser);

module.exports = { usersRouter: router };
