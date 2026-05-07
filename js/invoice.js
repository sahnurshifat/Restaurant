// ============================================================
// invoice.js — Fetch order, calculate totals, render invoice
// ============================================================

import { supabase } from './supabaseClient.js';

const invoiceContainer = document.getElementById('invoice-container');

// ── Config ────────────────────────────────────────────────────

const TAX_RATE = 0.05;   // 5 % VAT — adjust as needed

// ── Fetch ─────────────────────────────────────────────────────

/** Loads the order from Supabase and renders the full invoice. */
export async function loadInvoice() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('order') || sessionStorage.getItem('orderId');

  if (!orderId) {
    showError('No order ID found. Please scan your QR code again.');
    return;
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id,
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
    .eq('id', orderId)
    .single();

  if (error) {
    console.error('[invoice.js] Fetch error:', error.message);
    showError('Order not found. Please contact staff.');
    return;
  }

  renderInvoice(order);
}

// ── Calculations ──────────────────────────────────────────────

/**
 * Derives all monetary totals from the raw order data.
 * Uses unit_price × qty per line so the numbers are always
 * consistent with what was actually charged.
 *
 * @param {object} order
 * @returns {{ subtotal, taxAmount, grandTotal, lines }}
 */
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

  return { lines, subtotal, taxAmount, grandTotal };
}

// ── Render ────────────────────────────────────────────────────

function renderInvoice(order) {
  if (!invoiceContainer) return;

  const token     = order.id.slice(-4).toUpperCase();
  const dateStr   = new Date(order.created_at).toLocaleString('en-BD', {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const { lines, subtotal, taxAmount, grandTotal } = calculateTotals(order);

  // Payment method icon
  const payIcons = { cash: '💵', mobile: '📱', card: '💳' };
  const payIcon  = payIcons[order.payment_method] ?? '💳';

  // Status colour
  const statusColors = {
    paid:      'var(--c-success)',
    served:    '#4a6a8a',
    pending:   '#8a7a2a',
    preparing: '#2a5a8a',
    cancelled: 'var(--c-danger)',
  };
  const statusColor = statusColors[order.status] ?? 'var(--c-muted)';

  invoiceContainer.innerHTML = `

    <!-- ── Order meta ──────────────────────────────── -->
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
        <!-- Token -->
        <div style="
          display:inline-block;
          background:var(--c-bg);
          border:1.5px dashed var(--c-accent);
          border-radius:var(--radius-sm);
          padding:.25rem .9rem;
          margin-bottom:.4rem;
        ">
          <span style="font-size:.7rem; color:var(--c-muted); display:block; letter-spacing:.08em;">
            TOKEN
          </span>
          <span style="
            font-family:var(--ff-display); font-size:1.5rem;
            color:var(--c-accent-alt); letter-spacing:.12em;
          ">${token}</span>
        </div>
        <p style="font-size:.85rem; color:var(--c-muted);">Table ${order.table_id}</p>
      </div>
    </div>

    <!-- ── Status + payment row ───────────────────── -->
    <div style="
      display:flex; gap:.75rem; align-items:center;
      margin-bottom:1.25rem; flex-wrap:wrap;
    ">
      <span style="
        background:${statusColor}22;
        color:${statusColor};
        border:1px solid ${statusColor};
        border-radius:99px; padding:.2rem .8rem; font-size:.8rem; font-weight:600;
      ">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>

      <span style="color:var(--c-muted); font-size:.85rem;">
        ${payIcon} ${order.payment_method
          ? order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
          : '—'}
      </span>
    </div>

    <!-- ── Line items table ────────────────────────── -->
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
            <td style="text-align:right; color:var(--c-muted);">৳${line.price.toFixed(2)}</td>
            <td style="text-align:right;">৳${line.subtotal.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- ── Totals summary block ────────────────────── -->
    <div style="
      border:1px solid var(--c-border);
      border-radius:var(--radius-md);
      overflow:hidden;
      margin-top:1rem;
    ">
      <!-- Subtotal row -->
      <div style="
        display:flex; justify-content:space-between;
        padding:.65rem 1rem;
        border-bottom:1px solid var(--c-border);
        font-size:.9rem;
      ">
        <span style="color:var(--c-muted);">Subtotal</span>
        <span>৳${subtotal.toFixed(2)}</span>
      </div>

      <!-- Tax row -->
      <div style="
        display:flex; justify-content:space-between;
        padding:.65rem 1rem;
        border-bottom:1px solid var(--c-border);
        font-size:.9rem;
      ">
        <span style="color:var(--c-muted);">VAT (${(TAX_RATE * 100).toFixed(0)}%)</span>
        <span>৳${taxAmount.toFixed(2)}</span>
      </div>

      <!-- Grand total row -->
      <div style="
        display:flex; justify-content:space-between; align-items:center;
        padding:.85rem 1rem;
        background:var(--c-surface);
      ">
        <strong style="font-size:1rem;">Grand Total</strong>
        <strong style="
          font-family:var(--ff-display);
          font-size:1.4rem;
          color:var(--c-accent-alt);
        ">৳${grandTotal.toFixed(2)}</strong>
      </div>
    </div>

    <!-- ── Actions ─────────────────────────────────── -->
    <div style="display:flex; gap:.75rem; margin-top:1.5rem; flex-wrap:wrap;">
      <button class="btn btn--print" onclick="window.print()"
        style="flex:1; justify-content:center;">
        🖨 Print Invoice
      </button>
      <a href="index.html" class="btn btn--ghost"
        style="flex:1; justify-content:center; text-decoration:none;">
        ← Back to Menu
      </a>
    </div>
  `;
}

// ── Error helper ──────────────────────────────────────────────

function showError(msg) {
  if (invoiceContainer) {
    invoiceContainer.innerHTML = `
      <div style="text-align:center; padding:3rem 1rem;">
        <p style="font-size:2rem;">⚠️</p>
        <p class="error" style="margin-top:.5rem;">${msg}</p>
        <a href="index.html" class="btn btn--ghost" style="margin-top:1rem; display:inline-flex;">
          ← Back to Menu
        </a>
      </div>
    `;
  }
}

// ── Boot ──────────────────────────────────────────────────────

loadInvoice();
