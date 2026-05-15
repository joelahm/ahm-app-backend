const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { AppError } = require("../lib/errors");

const CITATION_ATTACHMENTS_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "citation-attachments",
);
const MAX_CITATION_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function readCitationId(req) {
  const id = Number(req.params.citationId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid citation id.");
  }
  return String(id);
}

function ensureCitationAttachmentDir(citationId) {
  const destination = path.join(CITATION_ATTACHMENTS_DIR, citationId);
  fs.mkdirSync(destination, { recursive: true });
  return destination;
}

function buildFileName(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  const safeExt = ext || ".bin";
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${safeExt}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      cb(null, ensureCitationAttachmentDir(readCitationId(req)));
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    cb(null, buildFileName(file.originalname));
  },
});

const uploadCitationAttachment = multer({
  storage,
  limits: {
    fileSize: MAX_CITATION_ATTACHMENT_SIZE_BYTES,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "VALIDATION_ERROR", "Unsupported attachment type."));
      return;
    }
    cb(null, true);
  },
});

function handleCitationAttachmentUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Attachment must be 25MB or less.",
        ),
      );
    }
    return next(new AppError(400, "VALIDATION_ERROR", err.message));
  }
  return next(err);
}

module.exports = {
  uploadCitationAttachment,
  handleCitationAttachmentUploadError,
};
