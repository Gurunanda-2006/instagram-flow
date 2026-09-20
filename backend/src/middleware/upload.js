'use strict';

/**
 * Multer configuration for handling media uploads from the frontend.
 *
 * - Stores files in memory (as Buffer) so the imageUpload service can
 *   pass them directly to Cloudinary without writing to disk.
 * - Accepts JPEG, PNG, WEBP, MP4, MOV (for Posts & Reels).
 * - 100 MB limit to safely support video files.
 */

const multer = require('multer');

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', // Images
  'video/mp4', 'video/quicktime'           // Videos (Reels)
];
const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: JPEG, PNG, WEBP, MP4, MOV`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

module.exports = { upload };
