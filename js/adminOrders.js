// ============================================================
// adminOrders.js — Today's orders: fetch, render, status +
//                  "Mark as Paid" with Supabase DB update
//
// ⚡ Uses polling instead of Realtime (free tier compatible).
//    Polls every 8s normally, every 3s when a status update
//    was just made (so the change feels instant to the admin).
// ============================================================

import { supabase }     from './supabaseClient.js';
import { requireAuth }  from './adminAuth.js';

const ordersContainer = document.getElementById('orders-container');

await requireAuth();

// ── Orders cache (for print access) ──────────────────────────
let _ordersCache = [];

// ── Polling config ────────────────────────────────────────────

const POLL_NORMAL_MS = 8000;   // 8s — background idle polling
const POLL_FAST_MS   = 3000;   // 3s — right after a status change
let   _pollTimer     = null;
let   _lastOrderHash = '';     // lightweight change detection

// ── Date helpers ──────────────────────────────────────────────

function todayRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,  0,  0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── Init ──────────────────────────────────────────────────────

export async function initOrders() {
  await fetchOrders();
  schedulePoll(POLL_NORMAL_MS);

  // Show last-refreshed time in header
  updateRefreshStamp();
}

/** Schedules the next poll, cancelling any existing timer. */
function schedulePoll(intervalMs) {
  clearTimeout(_pollTimer);
  _pollTimer = setTimeout(async () => {
    await fetchOrders();
    schedulePoll(POLL_NORMAL_MS);   // always return to normal interval after each poll
  }, intervalMs);
}

/** Triggers a fast follow-up poll after an action (status change, paid). */
function pollSoon() {
  schedulePoll(POLL_FAST_MS);
}

// ── Fetch ─────────────────────────────────────────────────────

async function fetchOrders() {
  const { start, end } = todayRange();

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      daily_token,
      table_id,
      status,
      payment_method,
      total,
      created_at,
      order_items (
        qty,
        unit_price,
        menu_items ( name )
      )
    `)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[adminOrders.js] Fetch error:', error.message);
    if (ordersContainer && !ordersContainer.querySelector('[data-id]')) {
      ordersContainer.innerHTML = '<p class="empty-state error">Failed to load orders. Retrying…</p>';
    }
    return;
  }

  const freshOrders = data ?? [];

  // ── Change detection: only re-render if data actually changed ─
  const newHash = hashOrders(freshOrders);
  if (newHash === _lastOrderHash) {
    updateRefreshStamp();
    return;
  }
  _lastOrderHash = newHash;

  _ordersCache = freshOrders;
  renderOrders(_ordersCache);
  updateRefreshStamp();
}

/**
 * Lightweight string fingerprint of orders.
 * Re-render only happens when this changes.
 */
function hashOrders(orders) {
  return orders.map(o => `${o.id}:${o.status}`).join('|');
}

/** Updates the "Last refreshed" indicator in the header. */
function updateRefreshStamp() {
  const el = document.getElementById('orders-refresh-stamp');
  if (el) {
    el.textContent = `↻ Last updated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }
}


// ── Render ────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:   { label: '⏳ Pending',   bg: '#4a3a00', color: '#ffd060', border: '#8a6a00' },
  preparing: { label: '🔥 Preparing', bg: '#003a5a', color: '#60c0ff', border: '#006a9a' },
  served:    { label: '✅ Served',    bg: '#003a20', color: '#60e090', border: '#006a40' },
  paid:      { label: '💚 Paid',      bg: '#003a20', color: '#a0ffc0', border: '#00aa60' },
  cancelled: { label: '✕ Cancelled', bg: '#3a0000', color: '#ff9090', border: '#8a0000' },
};

function statusPill(status) {
  const cfg = STATUS_CFG[status] ?? { label: status, bg: 'var(--c-border)', color: 'var(--c-muted)', border: 'var(--c-border)' };
  return `<span style="
    display:inline-block;
    background:${cfg.bg}; color:${cfg.color};
    border:1.5px solid ${cfg.border};
    border-radius:99px; padding:.25rem 1rem;
    font-size:.85rem; font-weight:700; letter-spacing:.03em;
    white-space:nowrap;
  ">${cfg.label}</span>`;
}

function renderOrders(orders) {
  if (!ordersContainer) return;

  if (!orders.length) {
    ordersContainer.innerHTML = `
      <div style="padding:3rem 0; text-align:center; color:var(--c-muted);">
        <div style="font-size:2rem; margin-bottom:.5rem;">📋</div>
        No orders today yet.
      </div>`;
    return;
  }

  ordersContainer.innerHTML = orders.map(order => {
    const token      = order.daily_token ?? order.id.slice(-4).toUpperCase();
    const time       = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isPaid     = order.status === 'paid';
    const isClosed   = isPaid || order.status === 'cancelled';

    const payIcons   = { cash: '💵', mobile: '📱', card: '💳' };
    const payIcon    = payIcons[order.payment_method] ?? '💳';

    const itemRows = order.order_items.map(i => `
      <div style="
        display:flex; justify-content:space-between; align-items:center;
        padding:.3rem 0; border-bottom:1px solid var(--c-border);
        font-size:.88rem;
      ">
        <span style="color:var(--c-text);">
          ${i.menu_items.name}
          <span style="color:var(--c-accent-alt); font-weight:600;"> ×${i.qty}</span>
        </span>
        <span style="color:var(--c-muted); white-space:nowrap; margin-left:.5rem;">
          ৳${(i.unit_price * i.qty).toFixed(2)}
        </span>
      </div>
    `).join('');

    return `
      <div data-id="${order.id}" style="
        background:var(--c-surface);
        border:1px solid ${isClosed ? 'var(--c-border)' : 'var(--c-accent)'};
        border-radius:var(--radius-md);
        padding:0;
        margin-bottom:1rem;
        overflow:hidden;
        ${isClosed ? 'opacity:.65;' : ''}
      ">

        <!-- ── Card header bar ─────────────────────── -->
        <div style="
          display:flex; align-items:center; flex-wrap:wrap;
          gap:.75rem; padding:.85rem 1.1rem;
          background:var(--c-bg);
          border-bottom:1px solid var(--c-border);
        ">
          <!-- TOKEN — the most important thing on the card -->
          <div style="
            display:flex; flex-direction:column; align-items:center;
            background:var(--c-surface);
            border:2px dashed var(--c-accent);
            border-radius:var(--radius-sm);
            padding:.2rem .8rem;
            min-width:64px;
          ">
            <span style="font-size:.6rem; color:var(--c-muted); letter-spacing:.1em; text-transform:uppercase;">Token</span>
            <span style="
              font-family:var(--ff-display);
              font-size:1.6rem; font-weight:700;
              color:var(--c-accent-alt);
              letter-spacing:.06em; line-height:1.1;
            ">${token}</span>
          </div>

          <!-- Table + payment -->
          <div>
            <div style="font-size:1rem; font-weight:700; color:var(--c-text);">Table ${order.table_id}</div>
            <div style="font-size:.78rem; color:var(--c-muted);">${payIcon} ${order.payment_method ?? '—'}</div>
          </div>

          <!-- Status pill -->
          ${statusPill(order.status)}

          <!-- Time pushed right -->
          <time style="margin-left:auto; font-size:.8rem; color:var(--c-muted); white-space:nowrap;">${time}</time>
        </div>

        <!-- ── Items + total ───────────────────────── -->
        <div style="padding:.75rem 1.1rem;">
          ${itemRows}
          <div style="
            display:flex; justify-content:flex-end; align-items:center;
            padding-top:.6rem; margin-top:.3rem;
          ">
            <span style="
              font-size:1.15rem; font-weight:700;
              color:var(--c-accent-alt);
            ">Total: ৳${Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        <!-- ── Action buttons ─────────────────────── -->
        <div style="
          display:flex; gap:.5rem; flex-wrap:wrap;
          padding:.75rem 1.1rem;
          border-top:1px solid var(--c-border);
          background:var(--c-bg);
        ">
          ${!isClosed ? `
            ${order.status !== 'preparing' ? `
              <button class="btn btn--status" data-id="${order.id}" data-status="preparing"
                style="font-size:.82rem; padding:.4rem .9rem; background:#1a3a5a; color:#90c8ff;">
                Preparing
              </button>` : ''}
            ${order.status !== 'served' ? `
              <button class="btn btn--status" data-id="${order.id}" data-status="served"
                style="font-size:.82rem; padding:.4rem .9rem; background:#1a3a20; color:#80e0a0;">
                Served
              </button>` : ''}
            <button class="btn btn--paid" data-id="${order.id}"
              style="font-size:.82rem; padding:.4rem .9rem; background:#1a4a2a; color:#a0ffc0; font-weight:700;">
              Mark as Paid
            </button>
            <button class="btn btn--status btn--danger" data-id="${order.id}" data-status="cancelled"
              style="font-size:.82rem; padding:.4rem .9rem; background:var(--c-danger);">
              Cancel
            </button>
          ` : ''}

          <!-- Print button — always visible on every order -->
          <button class="btn btn--print-order" data-id="${order.id}"
            style="
              font-size:.82rem; padding:.4rem .9rem;
              background:var(--c-surface); border:1px solid var(--c-border);
              color:var(--c-text); margin-left:auto;
            ">
            Print Invoice
          </button>
        </div>
      </div>
    `;
  }).join('');

  ordersContainer.querySelectorAll('.btn--status').forEach(btn =>
    btn.addEventListener('click', () => updateOrderStatus(btn.dataset.id, btn.dataset.status))
  );
  ordersContainer.querySelectorAll('.btn--paid').forEach(btn =>
    btn.addEventListener('click', () => markAsPaid(btn.dataset.id, btn))
  );
  ordersContainer.querySelectorAll('.btn--print-order').forEach(btn =>
    btn.addEventListener('click', () => {
      const card  = btn.closest('[data-id]');
      const order = _ordersCache.find(o => o.id === card.dataset.id);
      if (order) printInvoice(order);
    })
  );
}

// ── DB updates ────────────────────────────────────────────────

/** Updates order status (pending → preparing → served → cancelled). */
export async function updateOrderStatus(orderId, status) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) console.error('[adminOrders.js] Status update error:', error.message);
  else pollSoon();   // fast follow-up poll so change appears immediately
}

/**
 * Marks an order as paid in Supabase.
 * Sets status = 'paid' and stamps paid_at timestamp.
 * @param {string} orderId
 * @param {HTMLElement} btn  — button element for loading feedback
 */
export async function markAsPaid(orderId, btn) {
  // Loading feedback
  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Processing…';
  }

  // Attempt with paid_at timestamp (requires column to exist)
  let { error } = await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', orderId);

  // If paid_at column doesn't exist yet, fall back to status-only update
  if (error && error.message?.includes('paid_at')) {
    ({ error } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId));
  }

  if (error) {
    console.error('[adminOrders.js] Mark as paid error:', error.message);
    if (btn) {
      btn.disabled    = false;
      btn.textContent = '💰 Mark as Paid';
    }
    return;
  }

  pollSoon();   // fast follow-up poll so paid status appears immediately
}

// ── Print Invoice ─────────────────────────────────────────────

/**
 * Opens a clean printable invoice in a new tab for the given order.
 * The browser print dialog opens automatically.
 * @param {object} order — full order object from _ordersCache
 */
function printInvoice(order) {
  const token   = order.daily_token ?? order.id.slice(-4).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString('en-BD', {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const payLabels = { cash: 'Cash', mobile: 'Mobile Pay', card: 'Card' };
  const payLabel  = payLabels[order.payment_method] ?? order.payment_method ?? '—';
 
  const itemRows = order.order_items.map(item => {
    const subtotal = Number(item.unit_price) * item.qty;
    return `
      <tr>
        <td style="padding:5px 0; font-size:13px;">${item.menu_items.name}</td>
        <td style="padding:5px 0; font-size:13px; text-align:center;">${item.qty}</td>
        <td style="padding:5px 0; font-size:13px; text-align:right;">&#2547;${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding:5px 0; font-size:13px; text-align:right;">&#2547;${subtotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
 
  const grandTotal = order.order_items.reduce(
    (sum, i) => sum + Number(i.unit_price) * i.qty, 0
  );
 
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Receipt — ${token} — GRABZO</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
 
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 13px;
          color: #111;
          background: #fff;
          display: flex;
          justify-content: center;
          padding: 24px 16px;
        }
 
        .receipt {
          width: 100%;
          max-width: 320px;
        }
 
        .receipt-header {
          text-align: center;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px dashed #aaa;
        }
        .receipt-header h1 {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .receipt-header .tagline {
          font-size: 11px;
          font-style: italic;
          color: #555;
          margin-bottom: 6px;
        }
        .receipt-header .address {
          font-size: 11px;
          color: #555;
          line-height: 1.5;
        }
 
        .receipt-info {
          margin: 10px 0;
          padding-bottom: 10px;
          border-bottom: 1px dashed #aaa;
          font-size: 12px;
          line-height: 1.8;
        }
        .receipt-info .row {
          display: flex;
          justify-content: space-between;
        }
        .receipt-info .label { color: #555; }
        .receipt-info .value { font-weight: 700; }
 
        .token-box {
          text-align: center;
          margin: 10px 0;
          padding: 8px;
          border: 1px dashed #aaa;
        }
        .token-box .token-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .1em;
          color: #888;
        }
        .token-box .token-value {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: .15em;
        }
 
        .receipt-items {
          margin: 10px 0;
          padding-bottom: 10px;
          border-bottom: 1px dashed #aaa;
        }
        .receipt-items table {
          width: 100%;
          border-collapse: collapse;
        }
        .receipt-items thead th {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: #555;
          padding: 4px 0;
          border-bottom: 1px solid #ddd;
        }
        .receipt-items thead th:nth-child(2) { text-align:center; }
        .receipt-items thead th:nth-child(3),
        .receipt-items thead th:nth-child(4) { text-align:right; }
        .receipt-items tbody td { border-bottom: 1px dotted #eee; }
        .receipt-items tbody tr:last-child td { border-bottom: none; }
 
        .receipt-total {
          margin: 10px 0;
          padding-bottom: 10px;
          border-bottom: 1px dashed #aaa;
        }
        .receipt-total .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
        }
        .receipt-total .grand {
          font-size: 16px;
          font-weight: 900;
          border-top: 1px solid #111;
          margin-top: 4px;
          padding-top: 6px;
        }
 
        .receipt-footer {
          text-align: center;
          margin-top: 14px;
          font-size: 11px;
          color: #555;
          line-height: 1.8;
        }
        .receipt-footer .thank-you {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 4px;
        }
 
        @media print {
          body { padding: 0; }
          @page { margin: 0.5cm; size: 80mm auto; }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
 
        <div class="receipt-header">
          <h1>GRABZO</h1>
          <p class="tagline">Every Bite Matters</p>
          <p class="address">
            Pitha Ghor Goli, Jagannathpur<br>
            Bashundhara Road<br>
            +880 1749-586887
          </p>
        </div>
 
        <div class="receipt-info">
          <div class="row">
            <span class="label">Date</span>
            <span class="value">${dateStr}</span>
          </div>
          <div class="row">
            <span class="label">Order ID</span>
            <span class="value">#${order.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div class="row">
            <span class="label">Table</span>
            <span class="value">${order.table_id}</span>
          </div>
          <div class="row">
            <span class="label">Payment</span>
            <span class="value">${payLabel}</span>
          </div>
          <div class="row">
            <span class="label">Status</span>
            <span class="value">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
          </div>
        </div>
 
        <div class="token-box">
          <p class="token-label">Token No.</p>
          <p class="token-value">${token}</p>
        </div>
 
        <div class="receipt-items">
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
 
        <div class="receipt-total">
          <div class="total-row grand">
            <span>GRAND TOTAL</span>
            <span>&#2547;${grandTotal.toFixed(2)}</span>
          </div>
        </div>
 
        <div class="receipt-footer">
          <p class="thank-you">Thank you for dining with us!</p>
          <p>Please visit again</p>
          <p style="margin-top:8px; font-size:10px;">*** Customer Copy ***</p>
        </div>
 
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
 
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Boot ──────────────────────────────────────────────────────

initOrders();