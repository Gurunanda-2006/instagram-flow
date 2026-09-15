'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { cache } = require('./services/cache');

const publishRouter = require('./routes/publish');
const webhookRouter = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const { subscribeAccountToWebhook } = require('./services/instagram');

// ─── Raw webhook event logger (debug) ────────────────────────────────────────
const webhookLog = [];
app.use('/webhook/instagram', (req, _res, next) => {
  if (req.method === 'POST') {
    webhookLog.push({ ts: new Date().toISOString(), body: req.body });
    if (webhookLog.length > 20) webhookLog.shift();
    console.log('[DEBUG] Raw webhook received:', JSON.stringify(req.body));
  }
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api',      publishRouter);
app.use('/webhook',  webhookRouter);

// Debug: see the last webhook payloads Meta sent us
app.get('/api/last-webhook', (_req, res) => res.json(webhookLog));

// Debug: test sending a DM directly to an IGSID
app.get('/api/test-dm', async (req, res) => {
  const { igsid, message } = req.query;
  if (!igsid) return res.status(400).json({ error: 'Pass ?igsid=XXXX&message=hello' });
  try {
    const axios = require('axios');
    const result = await axios.post(
      `https://graph.instagram.com/v22.0/${process.env.IG_BUSINESS_ACCOUNT_ID}/messages`,
      { recipient: { id: igsid }, message: { text: message || 'Test DM from InstaFlow ✅' } },
      { params: { access_token: process.env.IG_ACCESS_TOKEN } }
    );
    res.json({ success: true, result: result.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// One-time endpoint: registers this IG account to receive webhook comment events
// Call GET https://instagram-flow.onrender.com/api/subscribe-webhook once after deploy
app.get('/api/subscribe-webhook', async (_req, res) => {
  try {
    const result = await subscribeAccountToWebhook();
    console.log('[SUBSCRIBE] Account subscribed to webhook successfully');
    res.json({ success: true, result });
  } catch (err) {
    console.error('[SUBSCRIBE] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Token refresh helper
app.get('/api/refresh-token', async (_req, res) => {
  try {
    const { refreshLongLivedToken } = require('./services/instagram');
    const data = await refreshLongLivedToken();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Boot ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    console.log('[BOOT] Warming in-memory cache from Google Sheets…');
    await cache.refresh();
    console.log(`[BOOT] Cache ready — ${cache.size()} posts loaded.`);
    
    // Warm up the deduplication cache for the webhook
    const { initSentCache } = require('./services/sheets');
    await initSentCache();
  } catch (err) {
    console.warn('[BOOT] Cache warm-up skipped:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`[BOOT] Server listening on port ${PORT}`);
  });
}

start();
