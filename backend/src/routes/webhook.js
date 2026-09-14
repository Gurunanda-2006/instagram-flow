'use strict';

/**
 * Instagram Webhook route
 *
 * GET  /webhook/instagram — Meta's verification handshake
 * POST /webhook/instagram — Receives comment events and sends private replies
 *
 * Deduplication: an in-memory Set of processed comment IDs prevents double-sending
 * if Meta retries a webhook event.  Resets on server restart (acceptable for
 * personal use — the 7-day reply window makes a missed retry harmless).
 */

const express          = require('express');
const { sendPrivateReply } = require('../services/instagram');
const { cache }            = require('../services/cache');

const router = express.Router();

/** Set of comment IDs already processed in this server session. */
const processedComments = new Set();

// ─── GET /webhook/instagram — Meta verification handshake ─────────────────────
router.get('/instagram', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.IG_WEBHOOK_VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verification handshake accepted ✓');
    return res.status(200).send(challenge);
  }

  console.warn('[WEBHOOK] Verification failed — token mismatch');
  return res.status(403).json({ error: 'Forbidden' });
});

// ─── POST /webhook/instagram — Process incoming events ───────────────────────
router.post('/instagram', express.json(), async (req, res) => {
  // Always respond 200 immediately — Meta requires a fast acknowledgement.
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;

    // Top-level guard
    if (body.object !== 'instagram') {
      console.log('[WEBHOOK] Ignored non-instagram object:', body.object);
      return;
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {

        // We only care about comment events
        if (change.field !== 'comments') continue;

        const value       = change.value || {};
        const commentId   = value.id;
        const mediaId     = value.media?.id;
        const text        = (value.text || '').toLowerCase().trim();
        const commenterIgsid = value.from?.id;   // Instagram Scoped User ID — used for DM
        const commenterName  = value.from?.username || 'unknown';

        console.log(`[WEBHOOK] Comment received from @${commenterName} (IGSID: ${commenterIgsid}): "${text}"`);

        if (!commentId || !mediaId || !text || !commenterIgsid) {
          console.log('[WEBHOOK] Skipping comment — missing fields:', { commentId, mediaId, text, commenterIgsid });
          continue;
        }

        // Deduplication guard
        if (processedComments.has(commentId)) {
          console.log(`[WEBHOOK] Already processed comment ${commentId} — skipping`);
          continue;
        }

        // Look up this post in the cache
        const postData = cache.get(mediaId);
        if (!postData) {
          console.log(`[WEBHOOK] No cache entry for media ${mediaId} — not our post`);
          continue;
        }

        const { trigger_keyword, product_link } = postData;

        // Case-insensitive keyword match
        if (!text.includes(trigger_keyword)) {
          console.log(`[WEBHOOK] Comment "${text}" doesn't match keyword "${trigger_keyword}"`);
          continue;
        }

        // Mark as processed before the async call to prevent races
        processedComments.add(commentId);

        console.log(`[WEBHOOK] ✓ Keyword match! Sending private DM to @${commenterName} (${commenterIgsid})`);
        await sendPrivateReply(commenterIgsid, product_link);

      }
    }
  } catch (err) {
    // Log but don't crash — we already sent 200
    console.error('[WEBHOOK] Error processing event:', err.message);
  }
});

module.exports = router;
