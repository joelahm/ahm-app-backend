const express = require('express');
const authController = require('./auth.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');

const router = express.Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/invitations/validate', authController.validateInvitation);
router.post('/invitations/accept', authController.acceptInvitation);
router.post('/invitations/check-email', authController.checkInvitationByEmail);
router.post('/invitations/register', authController.registerInvitedUser);
router.get('/me', authenticateAccessToken, authController.me);

module.exports = { authRouter: router };
