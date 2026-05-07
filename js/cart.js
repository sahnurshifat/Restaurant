// ============================================================
// cart.js — Cart state management (localStorage-backed)
// No checkout logic — handled by checkout.js
// ============================================================

const CART_KEY = 'rms_cart';

// ── Storage ───────────────────────────────────────────────────

/**
 * Reads the cart array from localStorage.
 * Returns an empty array if nothing is stored yet.
 * @returns {Array<{id:string, name:string, price:number, qty:number}>}
 */
export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Writes the cart array to localStorage and fires a
 * global `cartUpdated` event so any listener (header count,
 * sidebar total, etc.) can react without polling.
 * @param {Array} cart
 */
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: cart }));
}

// ── Mutations ─────────────────────────────────────────────────

/**
 * Adds an item to the cart.
 * If the item already exists, increments its quantity by 1.
 * @param {{ id:string, name:string, price:number }} item
 */
export function addToCart(item) {
  const cart     = getCart();
  const existing = cart.find(c => c.id === item.id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id:    item.id,
      name:  item.name,
      price: Number(item.price),
      qty:   1,
    });
  }

  saveCart(cart);
}

/**
 * Increases quantity of a specific item by 1.
 * @param {string} itemId
 */
export function increaseQty(itemId) {
  const cart  = getCart();
  const entry = cart.find(c => c.id === itemId);
  if (!entry) return;
  entry.qty += 1;
  saveCart(cart);
}

/**
 * Decreases quantity of a specific item by 1.
 * Removes the item entirely when quantity reaches 0.
 * @param {string} itemId
 */
export function decreaseQty(itemId) {
  const cart = getCart();
  const idx  = cart.findIndex(c => c.id === itemId);
  if (idx === -1) return;

  cart[idx].qty -= 1;

  if (cart[idx].qty <= 0) {
    cart.splice(idx, 1);   // remove completely
  }

  saveCart(cart);
}

/**
 * Removes an item completely regardless of quantity.
 * @param {string} itemId
 */
export function removeItem(itemId) {
  const cart = getCart().filter(c => c.id !== itemId);
  saveCart(cart);
}

/**
 * Empties the entire cart.
 */
export function clearCart() {
  saveCart([]);
}

// ── Computed values ───────────────────────────────────────────

/**
 * Returns the grand total (sum of price × qty for all items).
 * @returns {number}
 */
export function getCartTotal() {
  return getCart().reduce((sum, item) => sum + item.price * item.qty, 0);
}

/**
 * Returns the total number of individual items in the cart.
 * (e.g., 2× Burger + 3× Juice = 5)
 * @returns {number}
 */
export function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

// ── UI Renderer ───────────────────────────────────────────────

/**
 * Renders the full cart into a container element.
 * Wires + / – buttons for quantity control.
 * Shows a per-item subtotal and a grand total row.
 *
 * @param {string} containerId  — id of the wrapping element (e.g. 'cart-items')
 * @param {string} [totalId]    — id of the total <p> element (e.g. 'cart-total')
 */
export function renderCartUI(containerId, totalId = 'cart-total') {
  const el      = document.getElementById(containerId);
  const totalEl = document.getElementById(totalId);
  if (!el) return;

  const cart = getCart();

  // ── Empty state ──────────────────────────────────────
  if (cart.length === 0) {
    el.innerHTML = `
      <p class="empty-state" style="padding:1.5rem 0; font-size:.9rem;">
        Your cart is empty.
      </p>`;
    if (totalEl) totalEl.textContent = 'Total: ৳0.00';
    return;
  }

  // ── Item rows ────────────────────────────────────────
  el.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}" style="
      display:grid;
      grid-template-columns: 1fr auto auto auto;
      align-items:center;
      gap:.5rem;
      padding:.55rem 0;
      border-bottom:1px solid var(--c-border);
      font-size:.88rem;
    ">
      <!-- Name -->
      <span style="font-weight:500; color:var(--c-text);">${item.name}</span>

      <!-- – button -->
      <button
        class="qty-btn qty-btn--dec"
        data-id="${item.id}"
        style="
          width:26px; height:26px; border-radius:50%;
          border:1px solid var(--c-border);
          background:var(--c-surface); color:var(--c-text);
          font-size:1rem; line-height:1;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
        "
        aria-label="Decrease quantity"
      >−</button>

      <!-- Qty badge -->
      <span style="
        min-width:28px; text-align:center;
        font-weight:600; color:var(--c-accent-alt);
      ">${item.qty}</span>

      <!-- + button -->
      <button
        class="qty-btn qty-btn--inc"
        data-id="${item.id}"
        style="
          width:26px; height:26px; border-radius:50%;
          border:1px solid var(--c-border);
          background:var(--c-surface); color:var(--c-text);
          font-size:1rem; line-height:1;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
        "
        aria-label="Increase quantity"
      >+</button>

      <!-- Subtotal (spans full row below on its own line) -->
      <span style="
        grid-column:1/-1;
        text-align:right;
        font-size:.8rem;
        color:var(--c-muted);
      ">৳${(item.price * item.qty).toFixed(2)}</span>
    </div>
  `).join('');

  // ── Quantity button listeners ────────────────────────
  el.querySelectorAll('.qty-btn--inc').forEach(btn => {
    btn.addEventListener('click', () => {
      increaseQty(btn.dataset.id);
      renderCartUI(containerId, totalId);
    });
  });

  el.querySelectorAll('.qty-btn--dec').forEach(btn => {
    btn.addEventListener('click', () => {
      decreaseQty(btn.dataset.id);
      renderCartUI(containerId, totalId);
    });
  });

  // ── Grand total ──────────────────────────────────────
  if (totalEl) {
    const total     = getCartTotal();
    const itemCount = getCartCount();
    totalEl.innerHTML = `
      <span style="color:var(--c-muted); font-size:.82rem;">
        ${itemCount} item${itemCount !== 1 ? 's' : ''}
      </span>
      <strong style="float:right; color:var(--c-accent-alt); font-size:1.05rem;">
        ৳${total.toFixed(2)}
      </strong>
    `;
  }
}
