// ============================================================
// invoice.js — Fetch order, render invoice + live status tracker
// Polls order status every 6s until served or paid.
// ============================================================

import { supabase } from './supabaseClient.js';

const invoiceContainer = document.getElementById('invoice-container');

// ── Config ────────────────────────────────────────────────────

const TAX_RATE       = 0;
const POLL_MS        = 6000;
const FINAL_STATUSES = ['served', 'paid', 'cancelled'];

// ── State ─────────────────────────────────────────────────────

let _orderId    = null;
let _pollTimer  = null;
let _lastStatus = null;

// ── Boot ──────────────────────────────────────────────────────

export async function loadInvoice() {
  const params = new URLSearchParams(window.location.search);
  _orderId     = params.get('order') || sessionStorage.getItem('orderId');

  if (!_orderId) {
    showError('No order ID found. Please scan your QR code again.');
    return;
  }

  const { data: order, error } = await supabase
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
    .eq('id', _orderId)
    .single();

  if (error) {
    console.error('[invoice.js] Fetch error:', error.message);
    showError('Order not found. Please contact staff.');
    return;
  }

  _lastStatus = order.status;
  renderInvoice(order);

  // Start polling only if not already in a final state
  if (!FINAL_STATUSES.includes(order.status)) {
    schedulePoll();
  }
}

// ── Status polling ────────────────────────────────────────────

function schedulePoll() {
  clearTimeout(_pollTimer);
  _pollTimer = setTimeout(pollStatus, POLL_MS);
}

async function pollStatus() {
  const { data, error } = await supabase
    .from('orders')
    .select('status')
    .eq('id', _orderId)
    .single();

  if (error) {
    console.error('[invoice.js] Poll error:', error.message);
    schedulePoll();
    return;
  }

  if (data.status !== _lastStatus) {
    _lastStatus = data.status;
    updateStatusTracker(data.status);
  }

  if (!FINAL_STATUSES.includes(data.status)) {
    schedulePoll();
  }
}

// ── Status tracker UI ─────────────────────────────────────────

const STEPS = [
  { key: 'pending',   label: 'Order Placed', desc: 'We have received your order'  },
  { key: 'preparing', label: 'Preparing',    desc: 'Your food is being prepared'  },
  { key: 'served',    label: 'Served',        desc: 'Your order is on the way'     },
];

const STATUS_ORDER = ['pending', 'preparing', 'served', 'paid'];

function getStepIndex(status) {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : Math.min(idx, STEPS.length - 1);
}

function renderStatusTracker(status) {
  const activeIdx   = getStepIndex(status);
  const isCancelled = status === 'cancelled';
  const isPaid      = status === 'paid';

  if (isCancelled) {
    return `
      <div id="status-tracker" style="
        background:var(--c-surface);
        border:1px solid var(--c-danger);
        border-radius:var(--radius-md);
        padding:1.25rem 1.5rem;
        margin-bottom:1.5rem;
        text-align:center;
      ">
        <p style="font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; color:var(--c-muted); margin-bottom:.5rem;">Order Status</p>
        <p style="color:var(--c-danger); font-weight:700; font-size:1.1rem;">Order Cancelled</p>
        <p style="color:var(--c-muted); font-size:.85rem; margin-top:.25rem;">Please contact staff for assistance.</p>
      </div>
    `;
  }

  const steps = STEPS.map((step, i) => {
    const isDone    = i < activeIdx;
    const isActive  = i === activeIdx;
    const color     = isDone || isActive ? 'var(--c-accent)'     : 'var(--c-border)';
    const textColor = isDone || isActive ? 'var(--c-accent-alt)' : 'var(--c-muted)';

    return `
      <div style="
        display:flex; flex-direction:column; align-items:center;
        flex:1; position:relative; text-align:center;
      ">
        ${i > 0 ? `
          <div style="
            position:absolute; top:14px; right:50%;
            width:100%; height:2px;
            background:${isDone ? 'var(--c-accent)' : 'var(--c-border)'};
            z-index:0;
          "></div>
        ` : ''}

        <div style="
          width:28px; height:28px; border-radius:50%;
          background:${isDone || isActive ? 'var(--c-accent)' : 'var(--c-bg)'};
          border:2px solid ${color};
          display:flex; align-items:center; justify-content:center;
          position:relative; z-index:1;
          font-size:.75rem; font-weight:700;
          color:${isDone || isActive ? '#fff' : 'var(--c-muted)'};
          ${isActive ? 'box-shadow:0 0 0 4px rgba(201,96,58,.25);' : ''}
        ">
          ${isDone ? '&#10003;' : i + 1}
        </div>

        <p style="
          font-size:.75rem; font-weight:${isActive ? '700' : '400'};
          color:${textColor};
          margin-top:.4rem; margin-bottom:.15rem;
          line-height:1.2;
        ">${step.label}</p>

        ${isActive ? `
          <p style="font-size:.68rem; color:var(--c-muted); line-height:1.3;">
            ${step.desc}
          </p>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div id="status-tracker" style="
      background:var(--c-surface);
      border:1px solid var(--c-border);
      border-radius:var(--radius-md);
      padding:1.25rem 1.5rem;
      margin-bottom:1.5rem;
    ">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <p style="font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; color:var(--c-muted); margin:0;">
          Order Status
        </p>
        ${!FINAL_STATUSES.includes(status) ? `
          <span style="font-size:.72rem; color:var(--c-muted);">Updating automatically...</span>
        ` : ''}
        ${isPaid ? `
          <span style="
            background:var(--c-success); color:#d0f0d0;
            border-radius:99px; padding:.2rem .75rem;
            font-size:.75rem; font-weight:700;
          ">Paid</span>
        ` : ''}
      </div>

      <div style="display:flex; align-items:flex-start; gap:0; padding:0 .5rem;">
        ${steps}
      </div>
    </div>
  `;
}

function updateStatusTracker(status) {
  const existing = document.getElementById('status-tracker');
  if (!existing) return;
  const temp = document.createElement('div');
  temp.innerHTML = renderStatusTracker(status);
  existing.replaceWith(temp.firstElementChild);
}

// ── Calculations ──────────────────────────────────────────────

function calculateTotals(order) {
  const lines = order.order_items.map(item => ({
    name:     item.menu_items.name,
    qty:      item.qty,
    price:    Number(item.unit_price),
    subtotal: Number(item.unit_price) * item.qty,
  }));

  const subtotal   = lines.reduce((s, l) => s + l.subtotal, 0);
  const taxAmount  = subtotal * TAX_RATE;
  const grandTotal = subtotal + taxAmount;

  return { lines, grandTotal };
}

// ── Render invoice ────────────────────────────────────────────

function renderInvoice(order) {
  if (!invoiceContainer) return;

  const token   = order.daily_token ?? order.id.slice(-4).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString('en-BD', {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const { lines, grandTotal } = calculateTotals(order);

  const payIcons = { cash: '&#128181;', mobile: '&#128241;', card: '&#128179;' };
  const payIcon  = payIcons[order.payment_method] ?? '&#128179;';

  invoiceContainer.innerHTML = `

    <!-- Live status tracker -->
    ${renderStatusTracker(order.status)}

    <!-- Order meta -->
    <div style="
      display:flex; justify-content:space-between; align-items:flex-start;
      flex-wrap:wrap; gap:.75rem; margin-bottom:1.25rem;
    ">
      <div>
        <p style="font-size:.72rem; text-transform:uppercase; letter-spacing:.1em;
                  color:var(--c-muted); margin-bottom:.2rem;">Order</p>
        <h2 style="margin:0; font-size:1.4rem;">
          #${order.id.slice(0, 8).toUpperCase()}
        </h2>
        <p style="color:var(--c-muted); font-size:.85rem; margin-top:.2rem;">${dateStr}</p>
      </div>

      <div style="text-align:right;">
        <div style="
          display:inline-block;
          background:var(--c-bg);
          border:1.5px dashed var(--c-accent);
          border-radius:var(--radius-sm);
          padding:.25rem .9rem;
          margin-bottom:.4rem;
        ">
          <span style="font-size:.7rem; color:var(--c-muted); display:block; letter-spacing:.08em;">TOKEN</span>
          <span style="
            font-family:var(--ff-display); font-size:1.5rem;
            color:var(--c-accent-alt); letter-spacing:.12em;
          ">${token}</span>
        </div>
        <p style="font-size:.85rem; color:var(--c-muted);">Table ${order.table_id}</p>
      </div>
    </div>

    <!-- Payment method -->
    <div style="margin-bottom:1.25rem;">
      <span style="color:var(--c-muted); font-size:.85rem;">
        ${payIcon} ${order.payment_method
          ? order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
          : '—'}
      </span>
    </div>

    <!-- Line items -->
    <table class="invoice-table" style="margin-bottom:0;">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit</th>
          <th style="text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map(line => `
          <tr>
            <td>${line.name}</td>
            <td style="text-align:center;">${line.qty}</td>
            <td style="text-align:right; color:var(--c-muted);">&#2547;${line.price.toFixed(2)}</td>
            <td style="text-align:right;">&#2547;${line.subtotal.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Grand total -->
    <div style="
      border:1px solid var(--c-border);
      border-radius:var(--radius-md);
      overflow:hidden; margin-top:1rem;
    ">
      <div style="
        display:flex; justify-content:space-between; align-items:center;
        padding:.85rem 1rem; background:var(--c-surface);
      ">
        <strong style="font-size:1rem;">Grand Total</strong>
        <strong style="
          font-family:var(--ff-display); font-size:1.4rem;
          color:var(--c-accent-alt);
        ">&#2547;${grandTotal.toFixed(2)}</strong>
      </div>
    </div>

    <!-- Actions -->
    <div style="display:flex; gap:.75rem; margin-top:1.5rem; flex-wrap:wrap;">
      <button class="btn btn--print" onclick="window.print()"
        style="flex:1; justify-content:center;">
        Print Invoice
      </button>
      <a href="index.html" class="btn btn--ghost"
        style="flex:1; justify-content:center; text-decoration:none;">
        Back to Menu
      </a>
    </div>
  `;
}

// ── Error helper ──────────────────────────────────────────────

function showError(msg) {
  if (invoiceContainer) {
    invoiceContainer.innerHTML = `
      <div style="text-align:center; padding:3rem 1rem;">
        <p style="font-size:2rem;">!</p>
        <p class="error" style="margin-top:.5rem;">${msg}</p>
        <a href="index.html" class="btn btn--ghost" style="margin-top:1rem; display:inline-flex;">
          Back to Menu
        </a>
      </div>
    `;
  }
}

// ── Boot ──────────────────────────────────────────────────────

loadInvoice();