const express = require('express');
const projectsController = require('./projects.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireAnyPermission, requirePermission } = require('../../middleware/requirePermission');

const router = express.Router();

router.use(authenticateAccessToken);

const PROJECT_READ_PERMISSIONS = [
  'add-new-client',
  'edit-location-details',
  'remove-client',
  're-sync-location',
  'view-performance-dashboard'
];

router.get('/list', requireAnyPermission(PROJECT_READ_PERMISSIONS), projectsController.listProjects);
router.get('/tasks', requireAnyPermission(PROJECT_READ_PERMISSIONS), projectsController.listTasksGroupedByProject);
router.post('/tasks', requirePermission('edit-location-details'), projectsController.createProjectTaskFromBody);
router.patch('/tasks/:taskId', requirePermission('edit-location-details'), projectsController.updateProjectTask);
router.delete('/tasks/:taskId', requirePermission('remove-client'), projectsController.deleteProjectTask);
router.get('/tasks/:taskId/comments', requireAnyPermission(PROJECT_READ_PERMISSIONS), projectsController.listTaskComments);
router.post('/tasks/:taskId/comments', requirePermission('edit-location-details'), projectsController.createTaskComment);
router.delete('/tasks/comments/:commentId', requirePermission('edit-location-details'), projectsController.deleteTaskComment);
router.get('/:projectId/comments', requireAnyPermission(PROJECT_READ_PERMISSIONS), projectsController.listProjectComments);
router.post('/:projectId/comments', requirePermission('edit-location-details'), projectsController.createProjectComment);
router.delete('/comments/:commentId', requirePermission('edit-location-details'), projectsController.deleteProjectComment);
router.post('/:id/tasks', requirePermission('edit-location-details'), projectsController.createProjectTask);

module.exports = { projectsRouter: router };
