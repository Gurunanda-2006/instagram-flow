'use strict';

/**
 * Image upload service — Cloudinary (primary)
 *
 * Uploads the image buffer directly to Cloudinary and returns a
 * secure, permanent public URL that Instagram's Graph API can fetch
 * without any interstitial pages.
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Free tier: 25 GB storage + 25 GB bandwidth/month — more than enough
 * for personal Instagram use.
 *
 * The function signature is intentionally simple so swapping the
 * storage backend later is a one-function change.
 */

const cloudinary = require('cloudinary').v2;

// ─── Configure once at module load ───────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true, // always https://
});

// ─── Public entry point ───────────────────────────────────────────────────────
/**
 * Upload an image buffer to Cloudinary and return its public HTTPS URL.
 *
 * @param {Buffer}  fileBuffer   Raw image bytes from multer
 * @param {string}  mimeType     e.g. 'image/jpeg'
 * @param {string}  filename     Original filename (used as a human-readable public_id hint)
 * @returns {Promise<string>}    Permanent Cloudinary HTTPS URL
 */
async function uploadImage(fileBuffer, mimeType, filename) {
  // Validate env vars early so the error message is clear
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('CLOUDINARY_CLOUD_NAME is not set in environment variables');
  }
  if (!process.env.CLOUDINARY_API_KEY) {
    throw new Error('CLOUDINARY_API_KEY is not set in environment variables');
  }
  if (!process.env.CLOUDINARY_API_SECRET) {
    throw new Error('CLOUDINARY_API_SECRET is not set in environment variables');
  }

  // Strip extension from filename to use as a readable public_id prefix
  const baseName = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicId  = `instaflow/${baseName}_${Date.now()}`;

  console.log(`[IMAGE] Uploading to Cloudinary as "${publicId}"…`);

  // Upload via upload_stream (Buffer → stream → Cloudinary)
  const url = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'image',
        overwrite:     false,
        // Deliver as original quality — Instagram re-compresses anyway
        quality:       'auto',
        fetch_format:  'auto',
      },
      (error, result) => {
        if (error) return reject(new Error(`Cloudinary upload failed: ${error.message}`));
        resolve(result.secure_url);
      },
    );

    // Write buffer into the stream
    const { Readable } = require('stream');
    Readable.from(fileBuffer).pipe(uploadStream);
  });

  console.log(`[IMAGE] ✓ Uploaded to Cloudinary: ${url}`);
  return url;
}

module.exports = { uploadImage };
