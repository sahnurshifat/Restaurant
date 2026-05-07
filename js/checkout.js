// ============================================================
// checkout.js — Checkout popup UI + Supabase order submission
// UI: order summary, payment selector (Cash / Mobile / Card)
// DB:  inserts into orders + order_items, then redirects
// ============================================================

import { supabase }                        from './supabaseClient.js';
import { getCart, getCartTotal, clearCart } from './cart.js';
import { getTableId, requireActiveSession } from './session.js';

// ── Constants ─────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'cash',   label: 'Cash',         icon: '💵' },
  { id: 'mobile', label: 'Mobile Pay',   icon: '📱' },
  { id: 'card',   label: 'Card',         icon: '💳' },
];

// Tracks which payment method the user selected
let selectedPayment = null;

// ── Submission guard ──────────────────────────────────────────
// Set to true from the moment Confirm is clicked until the
// request fully resolves (success or error). Blocks all re-entry.
let isSubmitting = false;

// ── Popup builder ─────────────────────────────────────────────

/**
 * Injects the checkout modal markup into <body> once,
 * then populates it each time openCheckout() is called.
 */
function ensureModalExists() {
  if (document.getElementById('checkout-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'checkout-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'checkout-title');
  modal.innerHTML = `
    <!-- Backdrop -->
    <div id="checkout-backdrop" style="
      position:fixed; inset:0;
      background:rgba(0,0,0,.65);
      backdrop-filter:blur(3px);
      z-index:200;
    "></div>

    <!-- Panel -->
    <div id="checkout-panel" style="
      position:fixed;
      top:50%; left:50%;
      transform:translate(-50%,-50%);
      z-index:201;
      width:min(480px, 94vw);
      background:var(--c-surface);
      border:1px solid var(--c-border);
      border-radius:var(--radius-lg);
      box-shadow:0 24px 64px rgba(0,0,0,.6);
      display:flex;
      flex-direction:column;
      max-height:90vh;
      overflow:hidden;
    ">
      <!-- Header -->
      <div style="
        display:flex; align-items:center; justify-content:space-between;
        padding:1.25rem 1.5rem;
        border-bottom:1px solid var(--c-border);
        flex-shrink:0;
      ">
        <h2 id="checkout-title" style="font-size:1.2rem; margin:0;">
          Review Your Order
        </h2>
        <button id="checkout-close" aria-label="Close" style="
          background:none; border:none;
          color:var(--c-muted); font-size:1.4rem;
          cursor:pointer; line-height:1; padding:.2rem;
        ">✕</button>
      </div>

      <!-- Scrollable body -->
      <div style="overflow-y:auto; padding:1.25rem 1.5rem; flex:1;">

        <!-- Order summary table -->
        <p style="font-size:.75rem; text-transform:uppercase; letter-spacing:.08em;
                  color:var(--c-muted); margin-bottom:.75rem;">
          Order Summary
        </p>
        <div id="checkout-items"></div>

        <!-- Divider -->
        <div style="
          border-top:1px solid var(--c-border);
          margin:1rem 0;
        "></div>

        <!-- Total row -->
        <div style="
          display:flex; justify-content:space-between; align-items:center;
          margin-bottom:1.5rem;
        ">
          <span style="font-size:.9rem; color:var(--c-muted);">Grand Total</span>
          <strong id="checkout-total" style="
            font-size:1.3rem;
            color:var(--c-accent-alt);
            font-family:var(--ff-display);
          ">৳0.00</strong>
        </div>

        <!-- Payment method selector -->
        <p style="font-size:.75rem; text-transform:uppercase; letter-spacing:.08em;
                  color:var(--c-muted); margin-bottom:.75rem;">
          Payment Method
        </p>
        <div id="payment-options" style="
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:.65rem;
          margin-bottom:1.5rem;
        "></div>

        <!-- Validation message -->
        <p id="checkout-error" style="
          color:var(--c-danger);
          font-size:.85rem;
          min-height:1.2rem;
          margin-bottom:.5rem;
        "></p>

      </div>

      <!-- Footer CTA -->
      <div style="
        padding:1rem 1.5rem;
        border-top:1px solid var(--c-border);
        flex-shrink:0;
      ">
        <button id="checkout-confirm-btn" class="btn" style="width:100%; padding:.8rem; font-size:1rem;">
          Confirm Order
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.querySelector('#checkout-backdrop').addEventListener('click', closeCheckout);
  // Close on ✕
  modal.querySelector('#checkout-close').addEventListener('click', closeCheckout);
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCheckout();
  });
  // Confirm button
  modal.querySelector('#checkout-confirm-btn').addEventListener('click', handleConfirm);
}

// ── Open / close ──────────────────────────────────────────────

/**
 * Opens the checkout popup.
 * Guards: empty cart, closed session, already submitting.
 */
export function openCheckout() {
  // ── Guard 1: active submission in progress ─────────────
  if (isSubmitting) return;

  // ── Guard 2: empty cart ────────────────────────────────
  const cart = getCart();
  if (!cart.length) {
    showCartEmptyFeedback();
    return;
  }

  // ── Guard 3: session must be active ───────────────────
  // requireActiveSession() shows its own error banner and returns false
  if (!requireActiveSession()) return;

  ensureModalExists();
  selectedPayment = null;

  populateItems(cart);
  populatePaymentOptions();
  clearError();

  document.getElementById('checkout-modal').style.display = 'block';
  document.body.style.overflow = 'hidden';

  // Disable the Place Order button while modal is open to prevent
  // reopening modal via a second click before this one resolves
  const placeBtn = document.getElementById('checkout-btn');
  if (placeBtn) placeBtn.disabled = true;

  document.getElementById('checkout-close').focus();
}

/** Hides the checkout popup, restores scroll, re-enables Place Order button. */
export function closeCheckout() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';

  // Always re-enable the Place Order button when modal closes
  const placeBtn = document.getElementById('checkout-btn');
  if (placeBtn) placeBtn.disabled = false;
}

// ── Populate helpers ──────────────────────────────────────────

/**
 * Renders the order item rows inside the popup.
 * @param {Array} cart
 */
function populateItems(cart) {
  const container = document.getElementById('checkout-items');
  const totalEl   = document.getElementById('checkout-total');
  if (!container) return;

  container.innerHTML = cart.map(item => `
    <div style="
      display:flex; justify-content:space-between; align-items:baseline;
      padding:.45rem 0;
      border-bottom:1px solid var(--c-border);
      font-size:.9rem;
    ">
      <!-- Name + qty -->
      <span>
        <span style="color:var(--c-accent-alt); font-weight:600; margin-right:.4rem;">
          ×${item.qty}
        </span>
        ${item.name}
      </span>
      <!-- Line subtotal -->
      <span style="color:var(--c-muted); white-space:nowrap; margin-left:.75rem;">
        ৳${(item.price * item.qty).toFixed(2)}
      </span>
    </div>
  `).join('');

  if (totalEl) {
    totalEl.textContent = `৳${getCartTotal().toFixed(2)}`;
  }
}

/**
 * Renders the three payment method pills.
 * Clicking one toggles the selected state.
 */
function populatePaymentOptions() {
  const container = document.getElementById('payment-options');
  if (!container) return;

  container.innerHTML = PAYMENT_METHODS.map(method => `
    <button
      class="payment-pill"
      data-method="${method.id}"
      style="
        display:flex; flex-direction:column; align-items:center; gap:.35rem;
        padding:.75rem .5rem;
        background:var(--c-bg);
        border:2px solid var(--c-border);
        border-radius:var(--radius-md);
        color:var(--c-muted);
        font-family:var(--ff-body);
        font-size:.82rem;
        cursor:pointer;
        transition:border-color .18s, color .18s, background .18s;
      "
    >
      <span style="font-size:1.6rem;">${method.icon}</span>
      <span>${method.label}</span>
    </button>
  `).join('');

  // Wire selection toggle
  container.querySelectorAll('.payment-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      selectedPayment = pill.dataset.method;
      clearError();

      // Visual active state for all pills
      container.querySelectorAll('.payment-pill').forEach(p => {
        const isActive = p.dataset.method === selectedPayment;
        p.style.borderColor = isActive ? 'var(--c-accent)'     : 'var(--c-border)';
        p.style.color       = isActive ? 'var(--c-accent-alt)' : 'var(--c-muted)';
        p.style.background  = isActive ? 'var(--c-surface)'    : 'var(--c-bg)';
      });
    });
  });
}

// ── Cart validation ───────────────────────────────────────────

/**
 * Synchronous validation: checks price and quantity of every
 * cart item. Returns an error string or null if all is valid.
 * Item existence is verified async in verifyItemsExist().
 * @param {Array} cart
 * @returns {string|null}
 */
function validateCart(cart) {
  for (const item of cart) {
    if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
      return `Item "${item.name ?? 'unknown'}" has an invalid ID.`;
    }
    if (!Number.isFinite(item.price) || item.price <= 0) {
      return `Item "${item.name}" has an invalid price (৳${item.price}).`;
    }
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      return `Item "${item.name}" has an invalid quantity (${item.qty}).`;
    }
  }
  return null;
}

/**
 * Async validation: confirms every menu_item_id in the cart
 * still exists and is available in the DB.
 * Returns an error string or null.
 * @param {Array} cart
 * @returns {Promise<string|null>}
 */
async function verifyItemsExist(cart) {
  const ids = cart.map(i => i.id);

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, is_available')
    .in('id', ids);

  if (error) {
    console.error('[checkout.js] Item verification error:', error.message);
    return 'Could not verify menu items. Please try again.';
  }

  // Build a lookup map of what the DB knows
  const dbMap = Object.fromEntries(data.map(r => [r.id, r]));

  for (const item of cart) {
    const dbItem = dbMap[item.id];
    if (!dbItem) {
      return `"${item.name}" is no longer available. Please remove it from your cart.`;
    }
    if (!dbItem.is_available) {
      return `"${dbItem.name}" has been removed from the menu. Please update your cart.`;
    }
  }

  return null;
}

// ── Confirm handler ───────────────────────────────────────────

/**
 * Validates payment selection, inserts the order + order_items
 * into Supabase, then redirects to invoice.html.
 * UI feedback states are preserved exactly as before.
 */
async function handleConfirm() {
  // ── Guard 1: prevent double submission ────────────────
  if (isSubmitting) return;

  // ── Guard 2: payment method selected? ─────────────────
  if (!selectedPayment) {
    showError('Please select a payment method.');
    return;
  }

  // ── Guard 3: re-check cart (could have changed) ────────
  const cart = getCart();
  if (!cart.length) {
    showError('Your cart is empty. Please add items before ordering.');
    closeCheckout();
    return;
  }

  // ── Guard 4: re-check session (may have been closed) ──
  if (!requireActiveSession()) {
    closeCheckout();
    return;
  }

  const total   = getCartTotal();
  const tableId = getTableId();

  if (!tableId) {
    showError('No table found. Please scan the QR code again.');
    return;
  }

  // ── Guard 5: validate every cart item before touching DB ─
  const validationError = validateCart(cart);
  if (validationError) {
    showError(validationError);
    isSubmitting = false;
    return;
  }

  // ── Lock: block all re-entry from this point ──────────
  isSubmitting = true;
  const btn = document.getElementById('checkout-confirm-btn');
  if (btn) {
    btn.textContent = 'Verifying items…';
    btn.disabled    = true;
  }

  // ── Guard 6: verify items still exist in DB ───────────
  const existenceError = await verifyItemsExist(cart);
  if (existenceError) {
    showError(existenceError);
    isSubmitting = false;
    if (btn) { btn.textContent = 'Confirm Order'; btn.disabled = false; }
    return;
  }

  if (btn) btn.textContent = 'Placing order…';

  // ── 1. Insert order header ────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      table_id:       tableId,
      total:          total,
      payment_method: selectedPayment,
      status:         'pending',
    })
    .select('id, daily_token')
    .single();

  if (orderErr) {
    console.error('[checkout.js] Order insert failed:', orderErr.message);
    showError('Failed to place order. Please try again.');
    isSubmitting = false;
    if (btn) { btn.textContent = 'Confirm Order'; btn.disabled = false; }
    return;
  }

  // ── 2. Insert order_items rows ────────────────────────────
  const lineItems = cart.map(item => ({
    order_id:     order.id,
    menu_item_id: item.id,
    qty:          item.qty,
    unit_price:   item.price,
  }));

  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(lineItems);

  if (itemsErr) {
    console.error('[checkout.js] Order items insert failed:', itemsErr.message);
    showError('Order saved but items failed. Contact staff.');
    isSubmitting = false;
    if (btn) { btn.textContent = 'Confirm Order'; btn.disabled = false; }
    return;
  }

  // ── 3. Success — show token (DB-assigned), clear cart ────
  sessionStorage.setItem('orderId', order.id);
  clearCart();

  // Token is assigned by Supabase trigger (daily_token column).
  // Falls back to last-4 of UUID only if column not yet migrated.
  const token = order.daily_token ?? order.id.slice(-4).toUpperCase();

  showTokenScreen(token, () => {
    closeCheckout();
    window.location.href = `invoice.html?order=${order.id}`;
  });
}

/**
 * Replaces the modal body with a full-screen token confirmation.
 * Calls onDone() after the auto-redirect countdown reaches zero.
 * @param {string} token   — 4-char uppercase token shown to customer
 * @param {Function} onDone — called when countdown ends
 */
function showTokenScreen(token, onDone) {
  const panel = document.getElementById('checkout-panel');
  if (!panel) { onDone(); return; }

  let seconds = 5;

  panel.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; padding:2.5rem 2rem; text-align:center; gap:1rem;
    ">
      <!-- Tick icon -->
      <div style="
        width:64px; height:64px; border-radius:50%;
        background:var(--c-success);
        display:flex; align-items:center; justify-content:center;
        font-size:2rem;
      ">✓</div>

      <h2 style="color:var(--c-accent-alt); margin:0;">Order Confirmed!</h2>

      <p style="color:var(--c-muted); font-size:.9rem; margin:0;">
        Show this token number to your waiter
      </p>

      <!-- Token badge -->
      <div style="
        background:var(--c-bg);
        border:2px dashed var(--c-accent);
        border-radius:var(--radius-md);
        padding:1.25rem 2.5rem;
        margin:.5rem 0;
      ">
        <p style="color:var(--c-muted); font-size:.72rem; letter-spacing:.1em;
                  text-transform:uppercase; margin:0 0 .3rem;">Token No.</p>
        <p id="token-number" style="
          font-family:var(--ff-display);
          font-size:3rem;
          color:var(--c-accent-alt);
          letter-spacing:.15em;
          margin:0; line-height:1;
        ">${token}</p>
      </div>

      <p style="color:var(--c-muted); font-size:.82rem; margin:0;">
        Redirecting to invoice in <strong id="token-countdown">${seconds}</strong>s…
      </p>

      <button id="token-now-btn" class="btn" style="width:100%; margin-top:.5rem;">
        View Invoice Now
      </button>
    </div>
  `;

  // "View now" skips the countdown
  panel.querySelector('#token-now-btn').addEventListener('click', onDone);

  // Countdown ticker
  const ticker = setInterval(() => {
    seconds -= 1;
    const el = document.getElementById('token-countdown');
    if (el) el.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(ticker);
      onDone();
    }
  }, 1000);
}

// ── Feedback helpers ──────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('checkout-error');
  if (el) el.textContent = msg;
}

function clearError() {
  const el = document.getElementById('checkout-error');
  if (el) el.textContent = '';
}

/** Briefly pulses the Place Order button if cart is empty. */
function showCartEmptyFeedback() {
  const btn = document.getElementById('checkout-btn');
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent  = 'Cart is empty!';
  btn.style.background = 'var(--c-danger)';
  setTimeout(() => {
    btn.textContent      = original;
    btn.style.background = '';
  }, 1500);
}

// ── Auto-wire "Place Order" button ────────────────────────────

const checkoutBtn = document.getElementById('checkout-btn');
if (checkoutBtn) {
  checkoutBtn.addEventListener('click', openCheckout);
}

// Keep placeOrder exported so index.html script tag still works
export { openCheckout as placeOrder };
