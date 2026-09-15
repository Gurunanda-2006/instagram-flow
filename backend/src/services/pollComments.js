'use strict';

/**
 * Comment Polling Service — Strict deduplication by commenter IGSID
 *
 * Deduplication strategy (3 layers, in order):
 *
 *  Layer 1 — In-memory IGSID Set (sentCache)
 *    Fast check. Populated from Google Sheets at boot and updated on every
 *    successful DM send. Prevents redundant Sheets lookups within the same
 *    server process lifetime.
 *
 *  Layer 2 — Google Sheets "DM_Sent" tab
 *    Persistent across Render restarts and redeploys. On boot, the full list
 *    of already-notified IGSIDs is loaded into Layer 1. On every successful
 *    send, the IGSID is appended to this tab immediately.
 *
 *  Layer 3 — Own-account comment filter
 *    Skips any comment made by our own business account (e.g. public replies
 *    we posted) so they are never re-processed as triggers.
 *
 * KEY RULE: deduplication is by COMMENTER IGSID, not comment ID.
 * This means: once a person receives one DM, they NEVER receive another,
 * even if they comment again hours/days later on any post.
 */

const axios = require('axios');
const { cache } = require('./cache');
const { sendPrivateReply, replyToComment } = require('./instagram');
const { loadSentIgsids, isDMAlreadySent, markDMSent } = require('./sheets');

const BASE_URL = 'https://graph.instagram.com/v22.0';
const TOKEN    = () => process.env.IG_ACCESS_TOKEN;
const IG_USER  = () => process.env.IG_BUSINESS_ACCOUNT_ID;
const POLL_MS  = 60_000;

/**
 * In-memory cache of IGSIDs that have already received a DM.
 * Populated from Google Sheets at startup via initSentCache().
 * @type {Set<string>}
 */
let sentCache = new Set();

/**
 * Load all previously-sent IGSIDs from Google Sheets into the in-memory Set.
 * Called once at server boot so the guard is immediately warm.
 */
async function initSentCache() {
  sentCache = await loadSentIgsids();
  console.log(`[POLL] Dedup cache loaded — ${sentCache.size} IGSIDs already notified`);
}

// ─── Fetch live media list ────────────────────────────────────────────────────
async function fetchLiveMedia() {
  try {
    const res = await axios.get(`${BASE_URL}/${IG_USER()}/media`, {
      params: { fields: 'id,timestamp', access_token: TOKEN(), limit: 50 },
    });
    return res.data?.data || [];
  } catch (err) {
    console.warn('[POLL] Could not fetch media list:', err.response?.data?.error?.message || err.message);
    return [];
  }
}

// ─── Fetch top-level comments for a post ─────────────────────────────────────
async function fetchComments(mediaId) {
  try {
    const res = await axios.get(`${BASE_URL}/${mediaId}/comments`, {
      params: { fields: 'id,text,from,timestamp', access_token: TOKEN() },
    });
    return res.data?.data || [];
  } catch {
    return [];
  }
}

// ─── One poll cycle ───────────────────────────────────────────────────────────
async function pollOnce() {
  const liveMedia = await fetchLiveMedia();
  if (!liveMedia.length) return;

  const tracked = liveMedia.filter(m => cache.get(m.id));
  if (!tracked.length) return;

  for (const media of tracked) {
    const { trigger_keyword, product_link } = cache.get(media.id);
    const comments = await fetchComments(media.id);

    for (const comment of comments) {
      const commentId     = comment.id;
      const commenterIgsid = comment.from?.id;
      const commenterName  = comment.from?.username || 'unknown';
      const text           = (comment.text || '').toLowerCase().trim();

      if (!commentId || !commenterIgsid) continue;

      // Layer 3: skip our own account's comments (public replies we posted)
      // Checking username is the most reliable way since IG API can return different internal IDs
      if (commenterIgsid === IG_USER() || commenterName.toLowerCase() === 'asg_servizi') {
        continue;
      }

      // Keyword match
      if (!text.includes(trigger_keyword.toLowerCase())) continue;

      // ── Layer 1 + 2: Has this person already received a DM FOR THIS POST? ──
      if (isDMAlreadySent(sentCache, commenterIgsid, media.id)) {
        console.log(`[POLL] Skipping @${commenterName} for post ${media.id} — already notified for this post`);
        continue;
      }

      // ── Mark BEFORE sending to prevent race conditions across concurrent polls ──
      sentCache.add(`${commenterIgsid}_${media.id}`);

      console.log(`[POLL] ✓ New trigger from @${commenterName} on post ${media.id} — sending DM + reply`);

      try {
        // 1. Private DM with the product link
        await sendPrivateReply(commentId, product_link);
        console.log(`[POLL] ✓ DM sent to @${commenterName} (${commenterIgsid})`);

        // 2. Public comment reply to notify them
        // Use random variations to prevent Instagram from flagging consecutive exact matches as spam
        const replies = [
          'We have sent the product link to your DM! 📩 Check your messages.',
          'Just sent the link straight to your DM! ✅ Let us know if you got it.',
          'Link is in your messages! 💌 Go check your DM.',
          'Sent! 📬 Check your DM for the product link.'
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];

        await replyToComment(commentId, commenterName, randomReply);

        // 3. Persist to Google Sheets AFTER successful send
        await markDMSent(sentCache, commenterIgsid, commenterName, media.id, commentId);
        console.log(`[POLL] ✓ @${commenterName} logged in DM_Sent sheet for post ${media.id} — won't DM again for this post`);

      } catch (err) {
        // If sending failed, remove from in-memory Set so it retries next cycle
        sentCache.delete(`${commenterIgsid}_${media.id}`);
        console.error(`[POLL] ✗ Failed for @${commenterName}:`, err.response?.data || err.message);
      }
    }
  }
}

// ─── Start polling loop ───────────────────────────────────────────────────────
async function startPolling() {
  // Warm the dedup cache from Sheets before the first poll
  await initSentCache();

  console.log(`[POLL] Polling started — interval: ${POLL_MS / 1000}s`);
  pollOnce().catch(e => console.error('[POLL] Initial poll error:', e.message));
  setInterval(() => {
    pollOnce().catch(e => console.error('[POLL] Poll error:', e.message));
  }, POLL_MS);
}

module.exports = { startPolling };
