'use strict';

/**
 * Publish route
 *
 * POST /api/publish
 *   Multipart body:
 *     image          — the image file
 *     caption        — Instagram post caption
 *     product_link   — Amazon/Myntra URL to DM when triggered
 *     trigger_keyword— word/phrase to match in comments (e.g. "link")
 *
 * GET /api/posts
 *   Returns all rows from the Sheet as JSON (for the frontend list).
 *
 * GET /api/refresh-token
 *   Exchanges the current long-lived IG access token for a fresh one.
 *   Call this manually from the dashboard before the 60-day window closes.
 */

const express  = require('express');
const { upload }                      = require('../middleware/upload');
const { uploadMedia, deleteCloudinaryMedia } = require('../services/imageUpload');
const { createMediaContainer,
        publishContainer,
        refreshLongLivedToken,
        deleteInstagramPost }          = require('../services/instagram');
const { appendRow, getAllRows,
        deleteRowByMediaId, updateRowImageUrl } = require('../services/sheets');
const { cache }                       = require('../services/cache');

const router = express.Router();

// ─── POST /api/publish ────────────────────────────────────────────────────────
router.post('/publish', upload.single('media'), async (req, res, next) => {
  try {
    const { caption, product_link, trigger_keyword, is_reel } = req.body;
    const isReel = is_reel === 'true' || is_reel === true;

    if (!req.file)         return res.status(400).json({ error: 'No media uploaded' });
    if (!caption)          return res.status(400).json({ error: 'caption is required' });
    if (!product_link)     return res.status(400).json({ error: 'product_link is required' });
    if (!trigger_keyword)  return res.status(400).json({ error: 'trigger_keyword is required' });

    console.log(`[PUBLISH] Step 1 — uploading ${isReel ? 'video' : 'image'}…`);
    const mediaUrl = await uploadMedia(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );

    console.log('[PUBLISH] Step 2 — creating IG media container…');
    const containerId = await createMediaContainer(mediaUrl, caption, isReel);

    console.log('[PUBLISH] Step 3 — publishing container (may take a moment for videos)…');
    const igMediaId = await publishContainer(containerId);

    console.log('[PUBLISH] Step 4 — saving to Google Sheet…');
    await appendRow({
      ig_media_id:     igMediaId,
      image_url:       mediaUrl,
      caption,
      product_link,
      trigger_keyword,
      created_at:      new Date().toISOString(),
    });

    console.log('[PUBLISH] Step 5 — refreshing in-memory cache…');
    await cache.refresh();

    console.log(`[PUBLISH] ✓ Published! ig_media_id=${igMediaId}`);
    return res.json({ success: true, ig_media_id: igMediaId, image_url: mediaUrl });

  } catch (err) {
    next(err);
  }
});

// ─── GET /api/posts ───────────────────────────────────────────────────────────
router.get('/posts', async (_req, res, next) => {
  try {
    const rows = await getAllRows();
    // Newest first
    return res.json(rows.reverse());
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/refresh-token ───────────────────────────────────────────────────
router.get('/refresh-token', async (_req, res, next) => {
  try {
    const data = await refreshLongLivedToken();
    // NOTE: update IG_ACCESS_TOKEN in your Render env vars with data.access_token
    console.log('[TOKEN] Refreshed. New expiry:', data.expires_in, 'seconds from now.');
    return res.json({
      message:      'Token refreshed — update IG_ACCESS_TOKEN in Render env vars with the new token',
      access_token: data.access_token,
      expires_in:   data.expires_in,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/posts/:igMediaId ───────────────────────────────────────────
router.delete('/posts/:igMediaId', async (req, res, next) => {
  try {
    const { igMediaId } = req.params;
    const { mode } = req.query; // e.g. '?mode=cloudinary_only'
    if (!igMediaId) return res.status(400).json({ error: 'igMediaId is required' });

    // 1. Get the post data (for image_url) before deleting
    const allRows   = await getAllRows();
    const postRow   = allRows.find(r => r.ig_media_id === igMediaId);
    const mediaUrl  = postRow?.image_url || '';

    console.log(`[DELETE] Deleting post ${igMediaId} (Mode: ${mode || 'all'})…`);

    // Mode: CLOUDINARY ONLY
    if (mode === 'cloudinary_only') {
      if (mediaUrl && mediaUrl !== 'DELETED') {
        try { await deleteCloudinaryMedia(mediaUrl); }
        catch (e) { console.warn('[DELETE] Cloudinary delete failed:', e.message); }
      }
      // Update Google Sheet row so it remembers it is deleted
      await updateRowImageUrl(igMediaId, 'DELETED');
      await cache.refresh();

      return res.json({
        success: true,
        ig_media_id: igMediaId,
        message: 'Deleted from Cloudinary only. Post is still live on Instagram and automation is active.'
      });
    }

    // Mode: ALL (Default)
    // 2. Delete from Instagram (non-fatal if it fails)
    const igResult = await deleteInstagramPost(igMediaId);
    console.log('[DELETE] Instagram:', igResult.message);

    // 3. Delete media from Cloudinary (non-fatal)
    if (mediaUrl && mediaUrl !== 'DELETED') {
      try { await deleteCloudinaryMedia(mediaUrl); }
      catch (e) { console.warn('[DELETE] Cloudinary delete failed:', e.message); }
    }

    // 4. Delete row from Google Sheet
    const sheetDeleted = await deleteRowByMediaId(igMediaId);
    console.log('[DELETE] Sheet row deleted:', sheetDeleted);

    // 5. Refresh in-memory cache
    await cache.refresh();

    return res.json({
      success:         true,
      ig_media_id:     igMediaId,
      instagram:       igResult,
      cloudinary:      mediaUrl ? 'deleted' : 'no media',
      sheet:           sheetDeleted ? 'deleted' : 'not found',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
