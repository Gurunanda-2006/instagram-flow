'use strict';

/**
 * In-memory cache: ig_media_id → { product_link, trigger_keyword }
 *
 * This prevents the webhook handler from hitting the Sheets API on every
 * incoming comment.  Refreshed at server startup and after every publish.
 */

const { getAllRows } = require('./sheets');

const _store = new Map();

const cache = {
  /**
   * Read all rows from the Sheet and repopulate the map.
   * Called on boot and after every successful publish.
   */
  async refresh() {
    const rows = await getAllRows();
    _store.clear();

    for (const row of rows) {
      if (row.ig_media_id) {
        _store.set(row.ig_media_id, {
          product_link:    row.product_link    || '',
          trigger_keyword: (row.trigger_keyword || '').toLowerCase().trim(),
        });
      }
    }
  },

  /**
   * Look up a media entry by its Instagram media ID.
   * @param {string} igMediaId
   * @returns {{ product_link: string, trigger_keyword: string } | undefined}
   */
  get(igMediaId) {
    return _store.get(igMediaId);
  },

  /** Number of media entries currently cached. */
  size() {
    return _store.size;
  },

  /**
   * Return all cached posts as an array for the polling service.
   * @returns {Array<{ ig_media_id: string, product_link: string, trigger_keyword: string }>}
   */
  all() {
    return Array.from(_store.entries()).map(([ig_media_id, data]) => ({
      ig_media_id,
      ...data,
    }));
  },
};

module.exports = { cache };
