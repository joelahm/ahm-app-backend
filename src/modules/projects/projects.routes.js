const express = require('express');
const projectsController = require('./projects.controller');
const { authenticateAccessToken } = require('../../middleware/authenticateAccessToken');
const { requireAnyPermission, requirePermission } = require('../../middleware/requirePermission');
const {
  uploadTaskAttachment,
  handleTaskAttachmentUploadError
} = require('../../middleware/uploadTaskAttachment');

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
router.post('/tasks/:taskId/attachments', uploadTaskAttachment.single('file'), handleTaskAttachmentUploadError, projectsController.uploadTaskAttachment);
router.get('/tasks/:taskId/attachments', projectsController.listTaskAttachments);
router.delete('/tasks/attachments/:attachmentId', projectsController.deleteTaskAttachment);
router.get('/tasks/:taskId/checklists', projectsController.listChecklists);
router.post('/tasks/:taskId/checklists', projectsController.createChecklist);
router.patch('/tasks/checklists/:checklistId', projectsController.updateChecklist);
router.delete('/tasks/checklists/:checklistId', projectsController.deleteChecklist);
router.post('/tasks/checklists/:checklistId/items', projectsController.createChecklistItem);
router.patch('/tasks/checklists/items/:itemId', projectsController.updateChecklistItem);
router.delete('/tasks/checklists/items/:itemId', projectsController.deleteChecklistItem);
router.get('/tasks/:taskId/comments', requireAnyPermission(PROJECT_READ_PERMISSIONS), projectsController.listTaskComments);
router.post('/tasks/:taskId/comments', requirePermission('edit-location-details'), projectsController.createTaskComment);
router.delete('/tasks/comments/:commentId', requirePermission('edit-location-details'), projectsController.deleteTaskComment);
router.get('/tasks/:taskId/activity', projectsController.listTaskActivity);
router.get('/:projectId/comments', requireAnyPermission(PROJECT_READ_PERMISSIONS), projectsController.listProjectComments);
router.post('/:projectId/comments', requirePermission('edit-location-details'), projectsController.createProjectComment);
router.delete('/comments/:commentId', requirePermission('edit-location-details'), projectsController.deleteProjectComment);
router.post('/:id/tasks', requirePermission('edit-location-details'), projectsController.createProjectTask);

module.exports = { projectsRouter: router };
