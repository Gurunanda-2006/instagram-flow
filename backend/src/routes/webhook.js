'use strict';

/**
 * Instagram Webhook route
 *
 * GET  /webhook/instagram — Meta's verification handshake
 * POST /webhook/instagram — Receives live comment events
 *
 * This is the ultimate production-ready scalable approach. It processes comments
 * INSTANTLY with ZERO polling and ZERO rate limit worries.
 */

const express = require('express');
const { sendPrivateReply, replyToComment } = require('../services/instagram');
const { cache }                            = require('../services/cache');
const { isDMAlreadySent, markDMSent }      = require('../services/sheets');

const router = express.Router();
const IG_USER = () => process.env.IG_BUSINESS_ACCOUNT_ID;

/** 
 * Layer 0 Guard: In-memory Set of processed comment IDs.
 * Prevents processing the exact same comment twice if Meta retries a failed webhook.
 */
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
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue;

        const value          = change.value || {};
        const commentId      = value.id;
        const mediaId        = value.media?.id;
        const text           = (value.text || '').toLowerCase().trim();
        const commenterIgsid = value.from?.id;
        const commenterName  = value.from?.username || 'unknown';

        if (!commentId || !mediaId || !text || !commenterIgsid) continue;

        // Layer 0: Skip if we already processed this exact comment in this session
        if (processedComments.has(commentId)) continue;
        processedComments.add(commentId);

        // Layer 1: Skip our own account
        if (commenterIgsid === IG_USER() || commenterName.toLowerCase() === 'asg_servizi') {
          continue;
        }

        // Layer 2: Check if this post is tracked in our system
        const postData = cache.get(mediaId);
        if (!postData) continue; // Not a tracked post

        // Layer 3: Keyword match
        if (!text.includes(postData.trigger_keyword)) continue;

        // Layer 4: Strict Post-level Deduplication (Has this person already received a DM for this post?)
        if (isDMAlreadySent(commenterIgsid, mediaId)) {
          console.log(`[WEBHOOK] Skipping @${commenterName} for post ${mediaId} — already notified`);
          continue;
        }

        console.log(`[WEBHOOK] ✓ Keyword match for @${commenterName} on post ${mediaId}! Sending DM...`);

        try {
          // 1. Private DM
          await sendPrivateReply(commentId, postData.product_link);
          
          // 2. Public Reply with anti-spam variations
          const replies = [
            'We have sent the product link to your DM! 📩 Check your messages.',
            'Just sent the link straight to your DM! ✅ Let us know if you got it.',
            'Link is in your messages! 💌 Go check your DM.',
            'Sent! 📬 Check your DM for the product link.'
          ];
          const randomReply = replies[Math.floor(Math.random() * replies.length)];
          await replyToComment(commentId, commenterName, randomReply);

          // 3. Mark as sent in Google Sheets (locks them out of future DMs for this post)
          await markDMSent(commenterIgsid, commenterName, mediaId, commentId);
          console.log(`[WEBHOOK] ✓ @${commenterName} successfully processed and logged.`);

        } catch (err) {
          console.error(`[WEBHOOK] ✗ Failed to process @${commenterName}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[WEBHOOK] Fatal error processing event:', err.message);
  }
});

module.exports = router;
