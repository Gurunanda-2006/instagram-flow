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

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api',      publishRouter);
app.use('/webhook',  webhookRouter);

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
  } catch (err) {
    // Non-fatal: the sheet might be empty on first run
    console.warn('[BOOT] Cache warm-up skipped:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`[BOOT] Server listening on port ${PORT}`);
  });
}

start();
