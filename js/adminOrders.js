// ============================================================
// adminOrders.js — Today's orders: fetch, render, status +
//                  "Mark as Paid" & "Print Receipt"
//
// ⚡ Uses polling instead of Realtime (free tier compatible).
// ============================================================

import { supabase }     from './supabaseClient.js';
import { requireAuth }  from './adminAuth.js';

const ordersContainer = document.getElementById('orders-container');

await requireAuth();

// ── Polling config ────────────────────────────────────────────

const POLL_NORMAL_MS = 8000;   // 8s — background idle polling
const POLL_FAST_MS   = 3000;   // 3s — right after a status change
let   _pollTimer       = null;
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
  updateRefreshStamp();

  // Bind a single centralized click listener for all button actions (Event Delegation)
  if (ordersContainer) {
    ordersContainer.addEventListener('click', async (e) => {
      const btnStatus = e.target.closest('.btn--status');
      const btnPaid   = e.target.closest('.btn--paid');
      const btnPrint  = e.target.closest('.btn--print');

      if (btnStatus) {
        updateOrderStatus(btnStatus.dataset.id, btnStatus.dataset.status);
      }
      if (btnPaid) {
        markAsPaid(btnPaid.dataset.id, btnPaid);
      }
      if (btnPrint) {
        const orderId = btnPrint.dataset.id;
        // Fetch full record matching this ID from our current state cache or DOM if needed,
        // but since we need item names, we pass the order object by reconstructing it or re-fetching.
        // For simplicity, we find the global raw data or read it from a data attribute. 
        // Best approach: target the DOM element data or pass down via custom event.
        // Let's grab the data we injected right out of the window cache or a quick helper.
        const orderData = window._currentOrdersCache?.find(o => o.id === orderId);
        if (orderData) {
          printOrderReceipt(orderData);
        }
      }
    });
  }
}

/** Schedules the next poll, cancelling any existing timer. */
function schedulePoll(intervalMs) {
  clearTimeout(_pollTimer);
  _pollTimer = setTimeout(async () => {
    await fetchOrders();
    schedulePoll(POLL_NORMAL_MS);
  }, intervalMs);
}

/** Triggers a fast follow-up poll after an action. */
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

  // Save to window cache so print function can access full object fields easily
  window._currentOrdersCache = data ?? [];

  const newHash = hashOrders(data ?? []);
  if (newHash === _lastOrderHash) {
    updateRefreshStamp();
    return;
  }
  _lastOrderHash = newHash;

  renderOrders(data ?? []);
  updateRefreshStamp();
}

function hashOrders(orders) {
  return orders.map(o => `${o.id}:${o.status}`).join('|');
}

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
  paid:      { label: '✅ Paid',      bg: '#003a20', color: '#a0ffc0', border: '#00aa60' },
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

        <div style="
          display:flex; align-items:center; flex-wrap:wrap;
          gap:.75rem; padding:.85rem 1.1rem;
          background:var(--c-bg);
          border-bottom:1px solid var(--c-border);
        ">
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

          <div>
            <div style="font-size:1rem; font-weight:700; color:var(--c-text);">Table ${order.table_id}</div>
            <div style="font-size:.78rem; color:var(--c-muted);">${payIcon} ${order.payment_method ?? '—'}</div>
          </div>

          ${statusPill(order.status)}

          <button class="btn btn--print" data-id="${order.id}" title="Print Receipt" style="
            margin-left:auto; font-size:.85rem; padding:.4rem .7rem; 
            background:var(--c-bg); border:1px solid var(--c-border); 
            color:var(--c-text); border-radius:var(--radius-sm); cursor:pointer;
          ">
            🖨️ Print
          </button>

          <time style="font-size:.8rem; color:var(--c-muted); white-space:nowrap;">${time}</time>
        </div>

        <div style="padding:.75rem 1.1rem;">
          ${itemRows}
          <div style="display:flex; justify-content:flex-end; align-items:center; padding-top:.6rem; margin-top:.3rem;">
            <span style="font-size:1.15rem; font-weight:700; color:var(--c-accent-alt);">Total: ৳${Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        ${isClosed ? '' : `
        <div style="
          display:flex; gap:.5rem; flex-wrap:wrap;
          padding:.75rem 1.1rem;
          border-top:1px solid var(--c-border);
          background:var(--c-bg);
        ">
          ${order.status !== 'preparing' ? `
            <button class="btn btn--status" data-id="${order.id}" data-status="preparing"
              style="font-size:.82rem; padding:.4rem .9rem; background:#1a3a5a; color:#90c8ff;">
              🔥 Preparing
            </button>` : ''}
          ${order.status !== 'served' ? `
            <button class="btn btn--status" data-id="${order.id}" data-status="served"
              style="font-size:.82rem; padding:.4rem .9rem; background:#1a3a20; color:#80e0a0;">
              ✅ Served
            </button>` : ''}
          <button class="btn btn--paid" data-id="${order.id}"
            style="font-size:.82rem; padding:.4rem .9rem; background:#1a4a2a; color:#a0ffc0; font-weight:700;">
            ✅ Mark as Paid
          </button>
          <button class="btn btn--status btn--danger" data-id="${order.id}" data-status="cancelled"
            style="font-size:.82rem; padding:.4rem .9rem; margin-left:auto; background:var(--c-danger);">
            ✕ Cancel
          </button>
        </div>`}
      </div>
    `;
  }).join('');
}

// ── Printable HTML Generation ─────────────────────────────────

/**
 * Builds printable HTML layout dynamically and calls browser print window.
 * Designed clean and narrow for thermal POS printers (58mm/80mm compatible).
 */
export function printOrderReceipt(order) {
  const token = order.daily_token ?? order.id.slice(-4).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  
  const itemsHtml = order.order_items.map(i => `
    <tr>
      <td style="padding: 6px 0; font-size: 14px;">
        ${i.menu_items.name}<br>
        <small style="color: #555;">${i.qty} x ৳${Number(i.unit_price).toFixed(2)}</small>
      </td>
      <td style="text-align: right; vertical-align: top; padding: 6px 0; font-size: 14px;">
        ৳${(i.unit_price * i.qty).toFixed(2)}
      </td>
    </tr>
  `).join('');

  // Open an isolated sandbox window for the raw print layout
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt - Token ${token}</title>
      <style>
        @page { margin: 0; }
        body {
          font-family: 'Courier New', Courier, monospace;
          color: #000;
          background: #fff;
          padding: 20px;
          margin: 0;
          max-width: 320px; /* Perfect width constraints for standard POS receipts */
        }
        .header { text-align: center; margin-bottom: 15px; }
        .token-title { font-size: 28px; font-weight: bold; margin: 5px 0; border: 2px dashed #000; padding: 5px; }
        .details { font-size: 13px; margin-bottom: 10px; line-height: 1.4; }
        .divider { border-top: 1px dashed #000; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; }
        .total-row { font-size: 18px; font-weight: bold; text-align: right; }
        .footer { text-align: center; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin: 0; font-size: 20px;">KITCHEN RECEIPT</h2>
        <div class="token-title">TOKEN ${token}</div>
      </div>
      
      <div class="details">
        <strong>Table:</strong> ${order.table_id}<br>
        <strong>Date:</strong> ${dateStr}<br>
        <strong>Payment:</strong> ${order.payment_method?.toUpperCase() ?? 'PENDING'} (${order.status.toUpperCase()})
      </div>
      
      <div class="divider"></div>
      
      <table>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <div class="divider"></div>
      
      <div class="total-row">
        Total: ৳${Number(order.total).toFixed(2)}
      </div>
      
      <div class="footer">
        Thank You!<br>
        Please keep this voucher.
      </div>

      <script>
        // Auto-execution ensures prompt dialog matches lifecycle events cleanly
        window.onload = function() {
          window.print();
          setTimeout(() => { window.close(); }, 500);
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

// ── DB updates ────────────────────────────────────────────────

export async function updateOrderStatus(orderId, status) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) console.error('[adminOrders.js] Status update error:', error.message);
  else pollSoon();
}

export async function markAsPaid(orderId, btn) {
  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Processing…';
  }

  let { error } = await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', orderId);

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

  pollSoon();
}

// ── Boot ──────────────────────────────────────────────────────

initOrders();