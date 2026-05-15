const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const LAYOUT_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'website-content-layouts',
);
const MAX_LAYOUT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function ensureLayoutDir() {
  fs.mkdirSync(LAYOUT_DIR, { recursive: true });
}

function buildFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeExt = ext || '.jpg';

  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureLayoutDir();
    cb(null, LAYOUT_DIR);
  },
  filename(req, file, cb) {
    cb(null, buildFileName(file.originalname));
  },
});

const uploadWebsiteContentLayout = multer({
  storage,
  limits: {
    fileSize: MAX_LAYOUT_SIZE_BYTES,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Only JPG, PNG, WEBP, and GIF images are allowed.',
        ),
      );

      return;
    }

    cb(null, true);
  },
});

function handleWebsiteContentLayoutUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Layout image must be 10MB or less.',
        ),
      );
    }

    return next(new AppError(400, 'VALIDATION_ERROR', err.message));
  }

  return next(err);
}

module.exports = {
  uploadWebsiteContentLayout,
  handleWebsiteContentLayoutUploadError,
};
