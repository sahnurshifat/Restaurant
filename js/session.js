// ============================================================
// session.js — Table session: init, guard, admin close
// ============================================================

import { supabase } from './supabaseClient.js';

// ── Session keys ──────────────────────────────────────────────

const KEY_TABLE    = 'tableId';
const KEY_ORDER    = 'orderId';
const KEY_ACTIVE   = 'sessionActive';   // 'true' while table has open session

// ── Customer-facing ───────────────────────────────────────────

/**
 * Reads ?table=X from the URL, stores the table ID, and marks
 * the session as active.
 * Call this on page load for all customer-facing pages.
 */
export function initSession() {
  const params  = new URLSearchParams(window.location.search);
  const tableId = params.get('table');

  if (tableId) {
    sessionStorage.setItem(KEY_TABLE,  tableId);
    sessionStorage.setItem(KEY_ACTIVE, 'true');
  }
}

/** Returns the current table ID or null. */
export function getTableId() {
  return sessionStorage.getItem(KEY_TABLE);
}

/**
 * Checks whether the table has an active session.
 * Returns true only when both a tableId exists AND the
 * session has not been closed by the admin.
 * @returns {boolean}
 */
export function isSessionActive() {
  return (
    sessionStorage.getItem(KEY_TABLE)  !== null &&
    sessionStorage.getItem(KEY_ACTIVE) === 'true'
  );
}

/**
 * Guards the checkout flow.
 * Returns true if the session is valid and ordering is allowed.
 * Returns false and shows a user-facing banner if the session
 * is missing or has been closed by the admin.
 * @returns {boolean}
 */
export function requireActiveSession() {
  if (isSessionActive()) return true;

  // No valid session — show a non-blocking banner
  showSessionBanner(
    getTableId()
      ? 'Your session has been closed by staff. Please scan the QR code again.'
      : 'No table detected. Please scan the QR code on your table.'
  );
  return false;
}

/** Clears the customer session (called after order is placed). */
export function clearSession() {
  sessionStorage.removeItem(KEY_TABLE);
  sessionStorage.removeItem(KEY_ORDER);
  sessionStorage.removeItem(KEY_ACTIVE);
}

// ── Admin-facing ──────────────────────────────────────────────

/**
 * Closes the session for a specific table.
 * Writes a closed_at timestamp to the `table_sessions` row in
 * Supabase so other devices on the same table are also blocked.
 * Falls back gracefully if the table has no open session row.
 *
 * @param {string} tableId
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function closeTableSession(tableId) {
  if (!tableId) return { success: false, error: 'No tableId provided.' };

  const { error } = await supabase
    .from('table_sessions')
    .update({ closed_at: new Date().toISOString(), is_active: false })
    .eq('table_id', tableId)
    .eq('is_active', true);

  if (error) {
    console.error('[session.js] closeTableSession error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Opens a fresh session for a table (e.g., when new guests sit down).
 * Inserts a new row into `table_sessions`.
 *
 * @param {string} tableId
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function openTableSession(tableId) {
  if (!tableId) return { success: false, error: 'No tableId provided.' };

  const { error } = await supabase
    .from('table_sessions')
    .insert({ table_id: tableId, is_active: true });

  if (error) {
    console.error('[session.js] openTableSession error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ── UI helper ─────────────────────────────────────────────────

/**
 * Injects a dismissible banner at the top of the page.
 * Used by requireActiveSession() to inform the customer.
 * @param {string} msg
 */
function showSessionBanner(msg) {
  // Avoid duplicate banners
  if (document.getElementById('session-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'session-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    background: var(--c-danger, #8a3a3a);
    color: #fff;
    padding: .75rem 1.25rem;
    display: flex; align-items: center; justify-content: space-between;
    font-size: .9rem;
    z-index: 9999;
    box-shadow: 0 2px 12px rgba(0,0,0,.4);
  `;
  banner.innerHTML = `
    <span>⚠️ ${msg}</span>
    <button onclick="this.parentElement.remove()" style="
      background:none; border:none; color:#fff;
      font-size:1.1rem; cursor:pointer; padding:.1rem .4rem;
    ">✕</button>
  `;

  document.body.prepend(banner);
}
