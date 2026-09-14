'use strict';

/**
 * Comment Polling Service
 *
 * Since Meta only delivers real webhook events when the app is in Published/Live
 * state, this poller provides the same functionality in Development mode.
 *
 * Every POLL_INTERVAL_MS it:
 *   1. Iterates all posts in the in-memory cache
 *   2. Fetches the latest comments from the Instagram Graph API
 *   3. Matches comments against each post's trigger keyword
 *   4. Sends a private DM to matched commenters (once per comment)
 */

const axios = require('axios');
const { cache } = require('./cache');
const { sendPrivateReply } = require('./instagram');

const BASE_URL  = 'https://graph.instagram.com/v22.0';
const TOKEN     = () => process.env.IG_ACCESS_TOKEN;
const POLL_MS   = 60_000; // poll every 60 seconds

/** Set of comment IDs already processed (persists in memory for server lifetime) */
const processed = new Set();

// ─── Fetch comments for a single media post ───────────────────────────────────
async function fetchComments(mediaId) {
  try {
    const res = await axios.get(`${BASE_URL}/${mediaId}/comments`, {
      params: {
        fields:       'id,text,from,timestamp',
        access_token: TOKEN(),
      },
    });
    return res.data?.data || [];
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    // Media might be deleted or token lacks permission — skip silently
    console.warn(`[POLL] Could not fetch comments for media ${mediaId}: ${msg}`);
    return [];
  }
}

// ─── Process one poll cycle ───────────────────────────────────────────────────
async function pollOnce() {
  const posts = cache.all(); // returns array of { ig_media_id, trigger_keyword, product_link, … }

  if (!posts.length) return; // nothing to check

  for (const post of posts) {
    const { ig_media_id, trigger_keyword, product_link } = post;
    if (!ig_media_id || !trigger_keyword || !product_link) continue;

    const comments = await fetchComments(ig_media_id);

    for (const comment of comments) {
      const commentId = comment.id;
      if (!commentId)                    continue;
      if (processed.has(commentId))      continue; // already handled
      
      const text           = (comment.text || '').toLowerCase().trim();
      const commenterIgsid = comment.from?.id;
      const commenterName  = comment.from?.username || 'unknown';

      if (!text.includes(trigger_keyword.toLowerCase())) continue;
      if (!commenterIgsid) {
        console.log(`[POLL] Comment ${commentId} matched but no IGSID available — skipping`);
        processed.add(commentId);
        continue;
      }

      // Mark first to prevent duplicate sends even if sendPrivateReply throws
      processed.add(commentId);

      console.log(`[POLL] ✓ Keyword "${trigger_keyword}" matched! Comment by @${commenterName} — sending DM…`);
      try {
        await sendPrivateReply(commenterIgsid, product_link);
        console.log(`[POLL] ✓ DM sent to @${commenterName} (${commenterIgsid})`);
      } catch (err) {
        console.error(`[POLL] ✗ DM failed for @${commenterName}:`, err.message);
      }
    }
  }
}

// ─── Start the polling loop ───────────────────────────────────────────────────
function startPolling() {
  console.log(`[POLL] Comment polling started — checking every ${POLL_MS / 1000}s`);
  // Run once immediately, then on interval
  pollOnce().catch(err => console.error('[POLL] Initial poll error:', err.message));
  setInterval(() => {
    pollOnce().catch(err => console.error('[POLL] Poll error:', err.message));
  }, POLL_MS);
}

module.exports = { startPolling };
