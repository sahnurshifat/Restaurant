// ============================================================
// adminTransactions.js — Transaction History
// Groups all paid orders by date.
// Each row: date, paid order count, total revenue.
// Admin can export the full history as a PDF.
// ============================================================

import { supabase }    from './supabaseClient.js';
import { requireAuth } from './adminAuth.js';

await requireAuth();

const container = document.getElementById('transactions-container');
const exportBtn = document.getElementById('export-pdf-btn');

// ── Fetch ─────────────────────────────────────────────────────

/**
 * Fetches ALL paid orders from the beginning — no date filter.
 * Groups them by calendar date client-side.
 */
export async function loadTransactions() {
  if (container) {
    container.innerHTML = '<p class="empty-state">Loading transactions...</p>';
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, total, paid_at, created_at')
    .eq('status', 'paid')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[adminTransactions.js] Fetch error:', error.message);
    if (container) container.innerHTML = '<p class="empty-state error">Failed to load transactions.</p>';
    return;
  }

  const grouped = groupByDate(orders ?? []);
  renderTransactions(grouped);
}

// ── Group by date ─────────────────────────────────────────────

/**
 * Groups orders by their calendar date (YYYY-MM-DD).
 * Uses paid_at if available, falls back to created_at.
 * Returns an array sorted newest first.
 *
 * @param {Array} orders
 * @returns {Array<{ date, count, revenue }>}
 */
function groupByDate(orders) {
  const map = {};

  orders.forEach(order => {
    const raw  = order.paid_at || order.created_at;
    const date = raw.slice(0, 10);   // "YYYY-MM-DD"

    if (!map[date]) {
      map[date] = { date, count: 0, revenue: 0 };
    }
    map[date].count   += 1;
    map[date].revenue += Number(order.total);
  });

  // Sort newest first
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

// ── Format date ───────────────────────────────────────────────

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-BD', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── Render ────────────────────────────────────────────────────

function renderTransactions(rows) {
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">No paid transactions recorded yet.</p>';
    return;
  }

  // Grand totals for summary row
  const grandRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const grandOrders  = rows.reduce((s, r) => s + r.count, 0);

  container.innerHTML = `

    <!-- Summary bar -->
    <div style="
      display:flex; gap:1.5rem; flex-wrap:wrap;
      background:var(--c-surface);
      border:1px solid var(--c-border);
      border-radius:var(--radius-md);
      padding:1rem 1.25rem;
      margin-bottom:1.25rem;
    ">
      <div>
        <p style="font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--c-muted); margin-bottom:.2rem;">All-time Revenue</p>
        <p style="font-family:var(--ff-display); font-size:1.4rem; color:var(--c-accent-alt); margin:0;">
          &#2547;${grandRevenue.toFixed(2)}
        </p>
      </div>
      <div>
        <p style="font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--c-muted); margin-bottom:.2rem;">Total Paid Orders</p>
        <p style="font-family:var(--ff-display); font-size:1.4rem; color:#90c8ff; margin:0;">
          ${grandOrders}
        </p>
      </div>
      <div>
        <p style="font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--c-muted); margin-bottom:.2rem;">Days Recorded</p>
        <p style="font-family:var(--ff-display); font-size:1.4rem; color:#80e0a0; margin:0;">
          ${rows.length}
        </p>
      </div>
    </div>

    <!-- Table -->
    <div style="overflow-x:auto;">
      <table style="
        width:100%; border-collapse:collapse;
        font-size:.9rem;
      ">
        <thead>
          <tr style="background:var(--c-bg);">
            <th style="
              text-align:left; padding:.65rem 1rem;
              border-bottom:2px solid var(--c-accent);
              color:var(--c-muted); font-size:.72rem;
              text-transform:uppercase; letter-spacing:.08em;
            ">Date</th>
            <th style="
              text-align:center; padding:.65rem 1rem;
              border-bottom:2px solid var(--c-accent);
              color:var(--c-muted); font-size:.72rem;
              text-transform:uppercase; letter-spacing:.08em;
            ">Paid Orders</th>
            <th style="
              text-align:right; padding:.65rem 1rem;
              border-bottom:2px solid var(--c-accent);
              color:var(--c-muted); font-size:.72rem;
              text-transform:uppercase; letter-spacing:.08em;
            ">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr style="background:${i % 2 === 0 ? 'var(--c-surface)' : 'var(--c-bg)'};">
              <td style="padding:.7rem 1rem; border-bottom:1px solid var(--c-border); color:var(--c-text);">
                ${formatDate(row.date)}
              </td>
              <td style="padding:.7rem 1rem; border-bottom:1px solid var(--c-border); text-align:center; color:#90c8ff; font-weight:600;">
                ${row.count}
              </td>
              <td style="padding:.7rem 1rem; border-bottom:1px solid var(--c-border); text-align:right; color:var(--c-accent-alt); font-weight:700; font-family:var(--ff-display);">
                &#2547;${row.revenue.toFixed(2)}
              </td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--c-surface);">
            <td style="padding:.75rem 1rem; font-weight:700; color:var(--c-text);">Total</td>
            <td style="padding:.75rem 1rem; text-align:center; font-weight:700; color:#90c8ff;">${grandOrders}</td>
            <td style="padding:.75rem 1rem; text-align:right; font-weight:700; color:var(--c-accent-alt); font-family:var(--ff-display); font-size:1.1rem;">
              &#2547;${grandRevenue.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Store rows on the export button for PDF generation
  if (exportBtn) exportBtn._rows = rows;
}

// ── PDF Export ────────────────────────────────────────────────

/**
 * Builds a printable HTML page in a new window and triggers
 * the browser's native print-to-PDF dialog.
 * No external library needed.
 */
function exportToPDF() {
  const rows = exportBtn?._rows;
  if (!rows || !rows.length) {
    alert('No transaction data to export.');
    return;
  }

  const grandRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const grandOrders  = rows.reduce((s, r) => s + r.count,   0);
  const today        = new Date().toLocaleDateString('en-BD', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const tableRows = rows.map((row, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${formatDate(row.date)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:center;">${row.count}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">&#2547;${row.revenue.toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Transaction History — Khana Pina</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
        .summary { display: flex; gap: 32px; margin-bottom: 24px; padding: 14px 18px; background: #fef6f3; border: 1px solid #e8c8b8; border-radius: 8px; }
        .summary-item p:first-child { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #888; margin-bottom: 2px; }
        .summary-item p:last-child  { font-size: 18px; font-weight: 700; color: #c9603a; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #c9603a; color: #fff; }
        th { padding: 9px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
        th:nth-child(2) { text-align: center; }
        th:nth-child(3) { text-align: right; }
        tfoot tr { background: #fef6f3; font-weight: 700; }
        td:nth-child(2) { text-align: center; }
        td:nth-child(3) { text-align: right; }
        .footer { margin-top: 28px; font-size: 11px; color: #aaa; text-align: center; }
        @media print { body { padding: 16px; } }
      </style>
    </head>
    <body>
      <h1>Transaction History</h1>
      <p class="subtitle">Khana Pina Restaurant &nbsp;|&nbsp; Exported on ${today}</p>

      <div class="summary">
        <div class="summary-item">
          <p>All-time Revenue</p>
          <p>&#2547;${grandRevenue.toFixed(2)}</p>
        </div>
        <div class="summary-item">
          <p>Total Paid Orders</p>
          <p>${grandOrders}</p>
        </div>
        <div class="summary-item">
          <p>Days Recorded</p>
          <p>${rows.length}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Paid Orders</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr>
            <td style="padding:9px 12px;">Total</td>
            <td style="padding:9px 12px;">${grandOrders}</td>
            <td style="padding:9px 12px;">&#2547;${grandRevenue.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p class="footer">This report was generated automatically by the QR Restaurant System.</p>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Wire export button ────────────────────────────────────────

if (exportBtn) {
  exportBtn.addEventListener('click', exportToPDF);
}

// ── Boot ──────────────────────────────────────────────────────

loadTransactions();
