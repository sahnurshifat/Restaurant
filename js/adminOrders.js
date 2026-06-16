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
      // Only show error if there's nothing rendered yet
      ordersContainer.innerHTML = '<p class="empty-state error">Failed to load orders. Retrying…</p>';
    }
    return;
  }

  // ── Change detection: only re-render if data actually changed ─
  // Avoids flickering/losing scroll position on every 8s poll
  const newHash = hashOrders(_ordersCache);
  if (newHash === _lastOrderHash) {
    updateRefreshStamp();   // still update the timestamp
    return;
  }
  _lastOrderHash = newHash;

  _ordersCache = orders ?? [];
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

  const itemRows = order.order_items.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${item.menu_items.name}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:center;">${item.qty}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">
        &#2547;${Number(item.unit_price).toFixed(2)}
      </td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">
        &#2547;${(Number(item.unit_price) * item.qty).toFixed(2)}
      </td>
    </tr>
  `).join('');

  const grandTotal = order.order_items.reduce(
    (sum, i) => sum + Number(i.unit_price) * i.qty, 0
  );

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Invoice — Token ${token} — Khana Pina</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:Arial, sans-serif; font-size:13px; color:#111; padding:32px; max-width:600px; margin:0 auto; }

        .header { text-align:center; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #c9603a; }
        .header h1 { font-size:24px; color:#c9603a; margin-bottom:4px; }
        .header p  { color:#666; font-size:12px; }

        .meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
        .meta-left p { font-size:12px; color:#666; margin-bottom:3px; }
        .meta-left strong { font-size:14px; color:#111; }

        .token-box { border:1.5px dashed #c9603a; border-radius:6px; padding:6px 16px; text-align:center; }
        .token-box .label { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:#888; }
        .token-box .value { font-size:28px; font-weight:700; color:#c9603a; letter-spacing:.1em; line-height:1.1; }

        .status-row { display:flex; gap:12px; align-items:center; margin-bottom:20px; }
        .badge { display:inline-block; padding:3px 12px; border-radius:99px; font-size:11px; font-weight:600; }
        .badge-status { background:#e8f0e8; color:#2a6a2a; border:1px solid #8aca8a; }
        .badge-pay    { background:#f0f0e8; color:#6a6a2a; border:1px solid #caca8a; }

        table { width:100%; border-collapse:collapse; margin-bottom:16px; }
        thead tr { background:#c9603a; color:#fff; }
        th { padding:9px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
        th:nth-child(2) { text-align:center; }
        th:nth-child(3), th:nth-child(4) { text-align:right; }

        .total-row { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#fef6f3; border:1px solid #e8c8b8; border-radius:6px; margin-top:4px; }
        .total-row span:first-child { font-size:14px; font-weight:600; }
        .total-row span:last-child  { font-size:20px; font-weight:700; color:#c9603a; }

        .footer { margin-top:28px; text-align:center; font-size:11px; color:#aaa; border-top:1px solid #eee; padding-top:16px; }

        @media print {
          body { padding:16px; }
          @page { margin:1cm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Khana Pina</h1>
        <p>Your Restaurant Address &nbsp;|&nbsp; Your Phone Number</p>
        <p>${dateStr}</p>
      </div>

      <div class="meta">
        <div class="meta-left">
          <p>Order ID</p>
          <strong>#${order.id.slice(0, 8).toUpperCase()}</strong>
          <p style="margin-top:8px;">Table</p>
          <strong>${order.table_id}</strong>
        </div>
        <div class="token-box">
          <p class="label">Token No.</p>
          <p class="value">${token}</p>
        </div>
      </div>

      <div class="status-row">
        <span class="badge badge-status">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
        <span class="badge badge-pay">${payLabel}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="total-row">
        <span>Grand Total</span>
        <span>&#2547;${grandTotal.toFixed(2)}</span>
      </div>

      <div class="footer">
        <p>Thank you for dining with us!</p>
        <p style="margin-top:4px;">Please visit again.</p>
      </div>

      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Orders cache (for print access) ──────────────────────────
let _ordersCache = [];

// ── Boot ──────────────────────────────────────────────────────

initOrders();