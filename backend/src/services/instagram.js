'use strict';

/**
 * Instagram Graph API service
 *
 * All calls go to: https://graph.instagram.com/v21.0
 *
 * Functions:
 *   createMediaContainer  — POST /{ig-user-id}/media
 *   publishContainer      — POST /{ig-user-id}/media_publish
 *   sendPrivateReply      — POST /{comment-id}/replies
 *   refreshLongLivedToken — GET /refresh_access_token (manual token refresh)
 */

const axios = require('axios');

const BASE_URL  = 'https://graph.instagram.com/v21.0';
const IG_USER   = () => process.env.IG_BUSINESS_ACCOUNT_ID;
const TOKEN     = () => process.env.IG_ACCESS_TOKEN;

// ─── Helper ───────────────────────────────────────────────────────────────────
function igError(context, err) {
  const detail = err.response?.data?.error?.message || err.message;
  const error  = new Error(`[IG:${context}] ${detail}`);
  error.status = err.response?.status || 500;
  return error;
}

// ─── Create a media container ─────────────────────────────────────────────────
/**
 * Step 1 of the two-step publish flow.
 * @param {string} imageUrl  Publicly accessible image URL
 * @param {string} caption
 * @returns {Promise<string>} containerId
 */
async function createMediaContainer(imageUrl, caption) {
  try {
    const res = await axios.post(`${BASE_URL}/${IG_USER()}/media`, null, {
      params: {
        image_url:    imageUrl,
        caption,
        access_token: TOKEN(),
      },
    });
    return res.data.id;
  } catch (err) {
    throw igError('createContainer', err);
  }
}

// ─── Publish the container ────────────────────────────────────────────────────
/**
 * Step 2 of the two-step publish flow.
 * Instagram needs a short wait after container creation before publishing
 * (typically instant, but we poll with a small back-off for safety).
 *
 * @param {string} containerId
 * @returns {Promise<string>} ig_media_id of the published post
 */
async function publishContainer(containerId) {
  // Poll container status — must be FINISHED before publishing
  await waitForContainerReady(containerId);

  try {
    const res = await axios.post(`${BASE_URL}/${IG_USER()}/media_publish`, null, {
      params: {
        creation_id:  containerId,
        access_token: TOKEN(),
      },
    });
    return res.data.id;
  } catch (err) {
    throw igError('publishContainer', err);
  }
}

/**
 * Poll the container's STATUS field until it's FINISHED or ERROR.
 * Retries up to 10 times with 2-second gaps (20 seconds max).
 */
async function waitForContainerReady(containerId) {
  const MAX_ATTEMPTS = 10;
  const DELAY_MS     = 2000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = await axios.get(`${BASE_URL}/${containerId}`, {
      params: { fields: 'status_code', access_token: TOKEN() },
    });

    const status = res.data.status_code;
    if (status === 'FINISHED') return;
    if (status === 'ERROR')    throw new Error('Instagram media container entered ERROR state');

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  throw new Error('Instagram media container did not reach FINISHED state in time');
}

// ─── Send a private DM to a commenter ───────────────────────────────────────
/**
 * Sends a private DM to the commenter using the Instagram Messages API.
 * The message is routed to the commenter's Inbox (if they follow) or Message
 * Requests (if they don't) — Instagram handles the routing automatically.
 *
 * @param {string} commenterIgsid  The commenter's Instagram Scoped User ID
 *                                  (from webhook payload: value.from.id)
 * @param {string} message          The product link / reply text to send
 */
async function sendPrivateReply(commenterIgsid, message) {
  try {
    await axios.post(
      `${BASE_URL}/${IG_USER()}/messages`,
      {
        recipient: { id: commenterIgsid },
        message:   { text: message },
      },
      { params: { access_token: TOKEN() } },
    );
    console.log(`[IG] Private DM sent to IGSID ${commenterIgsid}`);
  } catch (err) {
    throw igError('sendPrivateReply', err);
  }
}

// ─── Subscribe IG account to webhook events ──────────────────────────────────
/**
 * Tells Instagram to send webhook events (comments) for this account to our
 * registered callback URL. Must be called once after deploying.
 * Call GET /api/subscribe-webhook to trigger this.
 */
async function subscribeAccountToWebhook() {
  try {
    const res = await axios.post(
      `${BASE_URL}/${IG_USER()}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: 'comments,messages',
          access_token:       TOKEN(),
        },
      },
    );
    console.log('[IG] Account subscribed to webhook:', res.data);
    return res.data;
  } catch (err) {
    throw igError('subscribeWebhook', err);
  }
}

// ─── Refresh a long-lived token (manual call) ─────────────────────────────────
/**
 * Exchanges the current long-lived token for a fresh one.
 * Call GET /api/refresh-token from the dashboard before the 60-day window closes.
 * @returns {Promise<{ access_token: string, expires_in: number }>}
 */
async function refreshLongLivedToken() {
  try {
    const res = await axios.get(`${BASE_URL}/refresh_access_token`, {
      params: {
        grant_type:   'ig_refresh_token',
        access_token: TOKEN(),
      },
    });
    return res.data;
  } catch (err) {
    throw igError('refreshToken', err);
  }
}

module.exports = {
  createMediaContainer,
  publishContainer,
  sendPrivateReply,
  subscribeAccountToWebhook,
  refreshLongLivedToken,
};
