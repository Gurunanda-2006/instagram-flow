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
const { upload }               = require('../middleware/upload');
const { uploadImage }          = require('../services/imageUpload');
const { createMediaContainer,
        publishContainer,
        refreshLongLivedToken }= require('../services/instagram');
const { appendRow, getAllRows } = require('../services/sheets');
const { cache }                = require('../services/cache');

const router = express.Router();

// ─── POST /api/publish ────────────────────────────────────────────────────────
router.post('/publish', upload.single('image'), async (req, res, next) => {
  try {
    const { caption, product_link, trigger_keyword } = req.body;

    if (!req.file)         return res.status(400).json({ error: 'No image uploaded' });
    if (!caption)          return res.status(400).json({ error: 'caption is required' });
    if (!product_link)     return res.status(400).json({ error: 'product_link is required' });
    if (!trigger_keyword)  return res.status(400).json({ error: 'trigger_keyword is required' });

    console.log('[PUBLISH] Step 1 — uploading image…');
    const imageUrl = await uploadImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );

    console.log('[PUBLISH] Step 2 — creating IG media container…');
    const containerId = await createMediaContainer(imageUrl, caption);

    console.log('[PUBLISH] Step 3 — publishing container…');
    const igMediaId = await publishContainer(containerId);

    console.log('[PUBLISH] Step 4 — saving to Google Sheet…');
    await appendRow({
      ig_media_id:     igMediaId,
      image_url:       imageUrl,
      caption,
      product_link,
      trigger_keyword,
      created_at:      new Date().toISOString(),
    });

    console.log('[PUBLISH] Step 5 — refreshing in-memory cache…');
    await cache.refresh();

    console.log(`[PUBLISH] ✓ Published! ig_media_id=${igMediaId}`);
    return res.json({ success: true, ig_media_id: igMediaId, image_url: imageUrl });

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

module.exports = router;
