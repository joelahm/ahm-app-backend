const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const TASK_ATTACHMENTS_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'task-attachments',
);
const MAX_TASK_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function readTaskId(req) {
  const id = Number(req.params.taskId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid task id.');
  }
  return String(id);
}

function ensureTaskAttachmentDir(taskId) {
  const destination = path.join(TASK_ATTACHMENTS_DIR, taskId);
  fs.mkdirSync(destination, { recursive: true });
  return destination;
}

function buildFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeExt = ext || '.bin';
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      cb(null, ensureTaskAttachmentDir(readTaskId(req)));
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    cb(null, buildFileName(file.originalname));
  },
});

const uploadTaskAttachment = multer({
  storage,
  limits: {
    fileSize: MAX_TASK_ATTACHMENT_SIZE_BYTES,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, 'VALIDATION_ERROR', 'Unsupported attachment type.'));
      return;
    }
    cb(null, true);
  },
});

function handleTaskAttachmentUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Attachment must be 25MB or less.'),
      );
    }
    return next(new AppError(400, 'VALIDATION_ERROR', err.message));
  }
  return next(err);
}

module.exports = {
  uploadTaskAttachment,
  handleTaskAttachmentUploadError,
};
