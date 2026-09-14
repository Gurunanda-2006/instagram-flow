'use strict';

/**
 * Multer configuration for handling image uploads from the frontend.
 *
 * - Stores files in memory (as Buffer) so the imageUpload service can
 *   pass them directly to Drive or GCS without writing to disk.
 * - Accepts JPEG, PNG, WEBP (all supported by the Instagram Graph API).
 * - 8 MB limit (Instagram's own limit is ~8 MB for image posts).
 */

const multer = require('multer');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: JPEG, PNG, WEBP`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

module.exports = { upload };
