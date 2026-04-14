const express = require('express');
const projectsController = require('./projects.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireRole } = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticateAccessToken);
router.use(requireRole('ADMIN'));

router.get('/tasks', projectsController.listTasksGroupedByProject);
router.post('/tasks', projectsController.createProjectTaskFromBody);
router.patch('/tasks/:taskId', projectsController.updateProjectTask);
router.delete('/tasks/:taskId', projectsController.deleteProjectTask);
router.get('/tasks/:taskId/comments', projectsController.listTaskComments);
router.post('/tasks/:taskId/comments', projectsController.createTaskComment);
router.delete('/tasks/comments/:commentId', projectsController.deleteTaskComment);
router.get('/:projectId/comments', projectsController.listProjectComments);
router.post('/:projectId/comments', projectsController.createProjectComment);
router.delete('/comments/:commentId', projectsController.deleteProjectComment);
router.post('/:id/tasks', projectsController.createProjectTask);

module.exports = { projectsRouter: router };
