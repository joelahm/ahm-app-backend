const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const CLIENT_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'clients');
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'image/svg+xml'
]);

function ensureClientUploadDir() {
  fs.mkdirSync(CLIENT_UPLOAD_DIR, { recursive: true });
}

function buildFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeExt = ext || '.bin';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureClientUploadDir();
    cb(null, CLIENT_UPLOAD_DIR);
  },
  filename(req, file, cb) {
    cb(null, buildFileName(file.originalname));
  }
});

const uploadClientAssets = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 100
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, 'VALIDATION_ERROR', 'Only PNG, JPG, PDF, and SVG files are allowed.'));
      return;
    }
    cb(null, true);
  }
});

function handleClientAssetsUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Each file must be 20MB or less.'));
    }
    return next(new AppError(400, 'VALIDATION_ERROR', err.message));
  }
  return next(err);
}

module.exports = {
  uploadClientAssets,
  handleClientAssetsUploadError
};
