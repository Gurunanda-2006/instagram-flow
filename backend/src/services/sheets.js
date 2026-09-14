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

module.exports = { getAllRows, appendRow };
