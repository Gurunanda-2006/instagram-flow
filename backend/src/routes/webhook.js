'use strict';

/**
 * Instagram Webhook route
 *
 * GET  /webhook/instagram — Meta's one-time verification handshake
 * POST /webhook/instagram — Acknowledges events from Meta (returns 200 immediately)
 *
 * NOTE: ALL DM sending and comment processing is handled exclusively by the
 * polling service (pollComments.js). This route does NOT send any DMs.
 * Having two systems send DMs causes duplicates.
 */

const express = require('express');
const router  = express.Router();

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

// ─── POST /webhook/instagram — Acknowledge Meta events ───────────────────────
// Meta requires a 200 response within 5 seconds.
// DM logic is handled by the polling service — not here.
router.post('/instagram', express.json(), (req, res) => {
  res.status(200).send('EVENT_RECEIVED');
});

module.exports = router;
