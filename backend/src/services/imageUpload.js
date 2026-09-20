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
 * Upload a media buffer to Cloudinary and return its public HTTPS URL.
 *
 * @param {Buffer}  fileBuffer   Raw bytes from multer
 * @param {string}  mimeType     e.g. 'image/jpeg' or 'video/mp4'
 * @param {string}  filename     Original filename (used as a human-readable public_id hint)
 * @returns {Promise<string>}    Permanent Cloudinary HTTPS URL
 */
async function uploadMedia(fileBuffer, mimeType, filename) {
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

  console.log(`[MEDIA] Uploading to Cloudinary as "${publicId}"…`);

  // Upload via upload_stream (Buffer → stream → Cloudinary)
  const url = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'auto', // Automatically detects image vs video
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

  console.log(`[MEDIA] ✓ Uploaded to Cloudinary: ${url}`);
  return url;
}

// ─── Delete media from Cloudinary ─────────────────────────────────────────
/**
 * Extracts the public_id from a Cloudinary URL and destroys the asset.
 *
 * @param {string} mediaUrl  The full Cloudinary media URL stored in the Sheet
 */
async function deleteCloudinaryMedia(mediaUrl) {
  if (!mediaUrl || !mediaUrl.includes('cloudinary.com')) {
    console.warn('[MEDIA] Skipping Cloudinary delete — URL not a Cloudinary URL:', mediaUrl);
    return;
  }

  // Extract everything after /upload/ and strip the file extension
  const match = mediaUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  if (!match) {
    console.warn('[MEDIA] Could not extract public_id from URL:', mediaUrl);
    return;
  }
  const publicId = match[1];
  
  // Need to figure out if it was a video or image. We can just try both or auto.
  // Actually, Cloudinary destroy requires the resource_type if it's not 'image'.
  // Since we might not know, we can try 'video' then 'image'.
  console.log(`[MEDIA] Deleting Cloudinary asset: ${publicId}`);

  try {
    let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    if (result.result !== 'ok') {
      result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
    console.log(`[MEDIA] Cloudinary delete result for "${publicId}":`, result.result);
  } catch (err) {
    console.warn('[MEDIA] Failed to delete from Cloudinary:', err.message);
  }
}

module.exports = { uploadMedia, deleteCloudinaryMedia };
