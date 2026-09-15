'use strict';

/**
 * Google Sheets service
 *
 * Authenticates via a service account whose credentials are stored as a
 * base64-encoded JSON file in GOOGLE_SERVICE_ACCOUNT_KEY_B64.
 *
 * Sheet columns (1-indexed, row 1 = headers):
 *   A: id
 *   B: ig_media_id
 *   C: image_url
 *   D: caption
 *   E: product_link
 *   F: trigger_keyword
 *   G: created_at
 */

const { google } = require('googleapis');

const SHEET_ID   = process.env.GOOGLE_SHEET_ID;
const TAB_NAME   = 'Sheet1';           // default tab name — change if yours differs
const HEADER_ROW = 1;                  // row 1 is the header

// ─── Auth ─────────────────────────────────────────────────────────────────────
function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set');

  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));

  return new google.auth.GoogleAuth({
    credentials: json,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// ─── Ensure header row exists ─────────────────────────────────────────────────
async function ensureHeaders() {
  const sheets = getSheetsClient();
  const range  = `${TAB_NAME}!A1:G1`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const existing = res.data.values ? res.data.values[0] : [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:     SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['id', 'ig_media_id', 'image_url', 'caption', 'product_link', 'trigger_keyword', 'created_at']],
      },
    });
  }
}

// ─── Read all data rows ───────────────────────────────────────────────────────
async function getAllRows() {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${TAB_NAME}!A:G`,
  });

  const rows = res.data.values || [];
  if (rows.length <= HEADER_ROW) return []; // no data rows yet

  const headers = rows[0]; // ['id', 'ig_media_id', 'image_url', 'caption', 'product_link', 'trigger_keyword', 'created_at']
  return rows.slice(HEADER_ROW).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

// ─── Append a new row ─────────────────────────────────────────────────────────
/**
 * @param {{ ig_media_id: string, image_url: string, caption: string,
 *           product_link: string, trigger_keyword: string }} data
 */
async function appendRow(data) {
  await ensureHeaders();

  const sheets = getSheetsClient();

  // Derive the next id from the current row count
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${TAB_NAME}!A:A`,
  });
  const rowCount = (res.data.values || []).length;
  const newId    = rowCount; // header is row 1, so first data row gets id=1

  const row = [
    String(newId),
    data.ig_media_id    || '',
    data.image_url      || '',
    data.caption        || '',
    data.product_link   || '',
    data.trigger_keyword|| '',
    data.created_at     || new Date().toISOString(),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId:     SHEET_ID,
    range:             `${TAB_NAME}!A:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return newId;
}

// ─── Delete a row by Instagram media ID ──────────────────────────────────────
/**
 * Finds the row in the sheet that contains the given ig_media_id (column B)
 * and permanently deletes it.
 * @param {string} igMediaId
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteRowByMediaId(igMediaId) {
  const sheets = getSheetsClient();

  // 1. Get all rows to find which row index has this media ID
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A:G`,
  });

  const rows = res.data.values || [];
  let targetRowIndex = -1; // 1-indexed sheet row
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === igMediaId) {
      targetRowIndex = i + 1; // rows array is 0-indexed; sheet rows are 1-indexed
      break;
    }
  }
  if (targetRowIndex === -1) return false;

  // 2. Get the internal sheetId (not the spreadsheet ID)
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetId = spreadsheet.data.sheets[0].properties.sheetId;

  // 3. Delete that single row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: targetRowIndex - 1, // batchUpdate uses 0-indexed
            endIndex:   targetRowIndex,
          },
        },
      }],
    },
  });

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PERMANENT DM SENT LOG — "DM_Sent" tab
//
//  Columns:  A: igsid | B: username | C: media_id | D: comment_id | E: sent_at
//
//  Once an IGSID is in this tab it NEVER gets another automated DM,
//  even if they comment again days later or the server restarts.
// ═══════════════════════════════════════════════════════════════════════════════

const DM_LOG_TAB = 'DM_Sent';

/**
 * Ensures the DM_Sent tab exists in the spreadsheet with correct headers.
 * Creates the tab if it doesn't exist yet.
 */
async function ensureDMLogTab() {
  const sheets = getSheetsClient();

  // Check if tab already exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some(
    (s) => s.properties.title === DM_LOG_TAB
  );

  if (!exists) {
    // Create the tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: DM_LOG_TAB } } }],
      },
    });
    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId:     SHEET_ID,
      range:             `${DM_LOG_TAB}!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['igsid', 'username', 'media_id', 'comment_id', 'sent_at']],
      },
    });
    console.log('[SHEETS] Created DM_Sent tab');
  }
}

/**
 * Loads all IGSIDs that have already received a DM into a Set.
 * Call once at boot to warm the in-memory guard.
 *
 * @returns {Promise<Set<string>>}
 */
async function loadSentIgsids() {
  try {
    await ensureDMLogTab();
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range:         `${DM_LOG_TAB}!A:A`,  // only column A (igsid)
    });
    const rows = res.data.values || [];
    // Skip header row (index 0)
    const ids = rows.slice(1).map((r) => r[0]).filter(Boolean);
    console.log(`[SHEETS] Loaded ${ids.length} already-sent IGSIDs from DM_Sent tab`);
    return new Set(ids);
  } catch (err) {
    console.warn('[SHEETS] Could not load DM_Sent tab:', err.message);
    return new Set();
  }
}

/**
 * Checks whether a DM has already been sent to this IGSID.
 * Uses the in-memory Set (sentCache) for speed — no network call.
 *
 * @param {Set<string>} sentCache  The in-memory Set populated at boot
 * @param {string}      igsid
 * @returns {boolean}
 */
function isDMAlreadySent(sentCache, igsid) {
  return sentCache.has(igsid);
}

/**
 * Records that a DM was sent to this IGSID by:
 *   1. Adding to the in-memory Set immediately
 *   2. Appending a row to the DM_Sent Google Sheet tab (persistent)
 *
 * @param {Set<string>} sentCache
 * @param {string}      igsid
 * @param {string}      username
 * @param {string}      mediaId
 * @param {string}      commentId
 */
async function markDMSent(sentCache, igsid, username, mediaId, commentId) {
  // 1. In-memory guard — instant
  sentCache.add(igsid);

  // 2. Persist to Google Sheets
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId:     SHEET_ID,
      range:             `${DM_LOG_TAB}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[igsid, username, mediaId, commentId, new Date().toISOString()]],
      },
    });
  } catch (err) {
    console.warn('[SHEETS] Could not persist DM_Sent record:', err.message);
    // Non-fatal: in-memory Set still guards this process
  }
}

module.exports = {
  getAllRows,
  appendRow,
  deleteRowByMediaId,
  loadSentIgsids,
  isDMAlreadySent,
  markDMSent,
};
