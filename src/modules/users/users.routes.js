const express = require('express');
const usersController = require('./users.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.post('/', usersController.createUser);
router.patch('/:id', usersController.patchUser);
router.patch('/:id/password', usersController.patchPassword);

module.exports = { usersRouter: router };
