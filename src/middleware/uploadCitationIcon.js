const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const CITATION_ICON_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'citation-icons',
);
const MAX_CITATION_ICON_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);

function ensureCitationIconDir() {
  fs.mkdirSync(CITATION_ICON_DIR, { recursive: true });
}

function buildFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeExt = ext || '.png';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureCitationIconDir();
    cb(null, CITATION_ICON_DIR);
  },
  filename(req, file, cb) {
    cb(null, buildFileName(file.originalname));
  },
});

const uploadCitationIcon = multer({
  storage,
  limits: {
    fileSize: MAX_CITATION_ICON_SIZE_BYTES,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Only JPG, PNG, WEBP, and SVG images are allowed.',
        ),
      );
      return;
    }

    cb(null, true);
  },
});

function handleCitationIconUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Citation icon must be 5MB or less.'),
      );
    }

    return next(new AppError(400, 'VALIDATION_ERROR', err.message));
  }

  return next(err);
}

module.exports = {
  handleCitationIconUploadError,
  uploadCitationIcon,
};
