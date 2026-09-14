'use strict';

/**
 * Comment Polling Service — Live Media approach
 *
 * Instead of relying on stale media IDs from the Google Sheet cache,
 * this poller fetches the LIVE media list from Instagram on every cycle.
 * It then cross-references those live IDs against the in-memory cache
 * to find posts that have a configured trigger keyword + product link.
 *
 * This prevents "Object does not exist" errors from deleted/stale IDs.
 */

const axios = require('axios');
const { cache } = require('./cache');
const { sendPrivateReply } = require('./instagram');

const BASE_URL  = 'https://graph.instagram.com/v22.0';
const TOKEN     = () => process.env.IG_ACCESS_TOKEN;
const IG_USER   = () => process.env.IG_BUSINESS_ACCOUNT_ID;
const POLL_MS   = 60_000;

/** Comment IDs already processed — prevents duplicate DMs */
const processed = new Set();

// ─── Fetch live media list from Instagram ─────────────────────────────────────
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

// ─── Fetch comments for a media post ─────────────────────────────────────────
async function fetchComments(mediaId) {
  try {
    const res = await axios.get(`${BASE_URL}/${mediaId}/comments`, {
      params: { fields: 'id,text,from,timestamp', access_token: TOKEN() },
    });
    return res.data?.data || [];
  } catch (err) {
    // Silently skip — post may be a reel/story that doesn't support comments API
    return [];
  }
}

// ─── One poll cycle ───────────────────────────────────────────────────────────
async function pollOnce() {
  // Step 1: get live media IDs from Instagram (always fresh)
  const liveMedia = await fetchLiveMedia();
  if (!liveMedia.length) return;

  // Step 2: intersect with cache — only process posts that have keyword+link configured
  const tracked = liveMedia.filter(m => cache.get(m.id));

  if (!tracked.length) {
    console.log('[POLL] No live Instagram posts match cache entries — publish a post via the dashboard first');
    return;
  }

  // Step 3: check comments on each tracked post
  for (const media of tracked) {
    const { trigger_keyword, product_link } = cache.get(media.id);
    const comments = await fetchComments(media.id);

    for (const comment of comments) {
      const commentId      = comment.id;
      if (!commentId || processed.has(commentId)) continue;

      const text           = (comment.text || '').toLowerCase().trim();
      const commenterIgsid = comment.from?.id;
      const commenterName  = comment.from?.username || 'unknown';

      if (!text.includes(trigger_keyword.toLowerCase())) continue;
      if (!commenterIgsid) {
        console.log(`[POLL] Comment ${commentId} matched but no IGSID — skipping`);
        processed.add(commentId);
        continue;
      }

      processed.add(commentId);
      console.log(`[POLL] ✓ Matched! "@${commenterName}" commented "${text}" — sending DM with: ${product_link}`);

      try {
        await sendPrivateReply(commenterIgsid, product_link);
        console.log(`[POLL] ✓ DM sent to @${commenterName}`);
      } catch (err) {
        console.error(`[POLL] ✗ DM failed for @${commenterName}:`, err.response?.data || err.message);
      }
    }
  }
}

// ─── Start polling loop ───────────────────────────────────────────────────────
function startPolling() {
  console.log(`[POLL] Polling started — checking live Instagram media every ${POLL_MS / 1000}s`);
  pollOnce().catch(e => console.error('[POLL] Initial poll error:', e.message));
  setInterval(() => {
    pollOnce().catch(e => console.error('[POLL] Poll error:', e.message));
  }, POLL_MS);
}

module.exports = { startPolling };
