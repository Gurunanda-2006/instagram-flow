'use strict';

/**
 * Comment Polling Service — Live Media approach
 *
 * Fetches the live Instagram media list every POLL_MS milliseconds,
 * cross-references with the in-memory cache (keyword + product link),
 * and for matching comments sends a private DM + a public reply.
 *
 * Duplicate-reply prevention (two layers):
 *   1. In-memory `processed` Set  — fast, survives within one server process
 *   2. API-based reply check       — queries existing replies on a comment
 *      before acting; survives Render restarts and redeploys
 *      (checks if our account already replied to that comment)
 */

const axios = require('axios');
const { cache } = require('./cache');
const { sendPrivateReply, replyToComment } = require('./instagram');

const BASE_URL = 'https://graph.instagram.com/v22.0';
const TOKEN    = () => process.env.IG_ACCESS_TOKEN;
const IG_USER  = () => process.env.IG_BUSINESS_ACCOUNT_ID;
const POLL_MS  = 60_000;

/** Layer-1 guard: comment IDs handled in this server process */
const processed = new Set();

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

// ─── Layer-2 guard: check if we already replied to this comment ───────────────
/**
 * Fetches the existing replies on a comment and returns true if our
 * business account (IG_BUSINESS_ACCOUNT_ID) has already posted a reply.
 * This survives server restarts — state comes from Instagram directly.
 *
 * @param {string} commentId
 * @returns {Promise<boolean>}
 */
async function alreadyReplied(commentId) {
  try {
    const res = await axios.get(`${BASE_URL}/${commentId}/replies`, {
      params: { fields: 'id,from', access_token: TOKEN() },
    });
    const replies = res.data?.data || [];
    const ourId   = IG_USER();
    return replies.some(r => r.from?.id === ourId);
  } catch {
    // If we can't check (e.g. comment has no replies endpoint), assume safe to proceed
    return false;
  }
}

// ─── One poll cycle ───────────────────────────────────────────────────────────
async function pollOnce() {
  const liveMedia = await fetchLiveMedia();
  if (!liveMedia.length) return;

  const tracked = liveMedia.filter(m => cache.get(m.id));
  if (!tracked.length) {
    console.log('[POLL] No tracked posts found — publish a post via the dashboard first');
    return;
  }

  for (const media of tracked) {
    const { trigger_keyword, product_link } = cache.get(media.id);
    const comments = await fetchComments(media.id);

    for (const comment of comments) {
      const commentId     = comment.id;
      if (!commentId) continue;

      // Layer-1: skip if already handled in this process lifetime
      if (processed.has(commentId)) continue;

      const commenterName = comment.from?.username || 'unknown';
      const commenterFrom = comment.from?.id;
      const text          = (comment.text || '').toLowerCase().trim();

      // Skip if commenter is our own account (prevent processing our own replies)
      if (commenterFrom === IG_USER()) {
        processed.add(commentId);
        continue;
      }

      // Keyword match check
      if (!text.includes(trigger_keyword.toLowerCase())) continue;

      // Layer-2: check Instagram directly — already replied? (survives restarts)
      const replied = await alreadyReplied(commentId);
      if (replied) {
        console.log(`[POLL] Skipping comment ${commentId} — already replied to @${commenterName}`);
        processed.add(commentId); // add to Layer-1 to skip API call next time
        continue;
      }

      // Mark as processed BEFORE sending to prevent race conditions
      processed.add(commentId);
      console.log(`[POLL] ✓ "${text}" by @${commenterName} — sending DM + public reply`);

      try {
        // 1. Private DM with the product link
        await sendPrivateReply(commentId, product_link);
        console.log(`[POLL] ✓ DM sent to @${commenterName}`);

        // 2. Public comment reply to notify them
        await replyToComment(
          commentId,
          commenterName,
          'We have sent the product link to your DM! 📩 Check your messages.'
        );
      } catch (err) {
        console.error(`[POLL] ✗ Failed for @${commenterName}:`, err.response?.data || err.message);
      }
    }
  }
}

// ─── Start polling loop ───────────────────────────────────────────────────────
function startPolling() {
  console.log(`[POLL] Polling started — interval: ${POLL_MS / 1000}s`);
  pollOnce().catch(e => console.error('[POLL] Initial poll error:', e.message));
  setInterval(() => {
    pollOnce().catch(e => console.error('[POLL] Poll error:', e.message));
  }, POLL_MS);
}

module.exports = { startPolling };
