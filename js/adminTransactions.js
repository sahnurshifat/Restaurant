// ============================================================
// adminTransactions.js — Transaction History
// Groups all paid orders by date.
// Monthly filter dropdown — defaults to current month.
// PDF export covers the selected month only.
// ============================================================

import { supabase }    from './supabaseClient.js';
import { requireAuth } from './adminAuth.js';

await requireAuth();

const container = document.getElementById('transactions-container');
const exportBtn = document.getElementById('export-pdf-btn');

// ── State ─────────────────────────────────────────────────────

let _allRows        = [];   // all daily rows across all time
let _selectedMonth  = '';   // "YYYY-MM" — currently selected month

// ── Fetch ─────────────────────────────────────────────────────

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

  _allRows = groupByDate(orders ?? []);

  // Default to current month
  const now = new Date();
  _selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  renderMonthFilter();
  renderTransactions(filteredRows());
}

// ── Group by date ─────────────────────────────────────────────

function groupByDate(orders) {
  const map = {};
  orders.forEach(order => {
    const raw  = order.paid_at || order.created_at;
    const date = raw.slice(0, 10);
    if (!map[date]) map[date] = { date, count: 0, revenue: 0 };
    map[date].count   += 1;
    map[date].revenue += Number(order.total);
  });
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

// ── Filter helpers ────────────────────────────────────────────

/** Returns rows matching the selected month (YYYY-MM). */
function filteredRows() {
  return _allRows.filter(r => r.date.slice(0, 7) === _selectedMonth);
}

/** Extracts unique "YYYY-MM" months from all rows, newest first. */
function availableMonths() {
  const seen = new Set();
  _allRows.forEach(r => seen.add(r.date.slice(0, 7)));
  return [...seen].sort((a, b) => b.localeCompare(a));
}

/** Formats "YYYY-MM" → "June 2026" */
function formatMonth(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-BD', { year: 'numeric', month: 'long' });
}

// ── Format date ───────────────────────────────────────────────

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-BD', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── Month filter dropdown ─────────────────────────────────────

function renderMonthFilter() {
  // Remove existing filter if present
  document.getElementById('month-filter-bar')?.remove();

  const months = availableMonths();
  if (!months.length) return;

  const bar = document.createElement('div');
  bar.id = 'month-filter-bar';
  bar.style.cssText = `
    display:flex; align-items:center; gap:.75rem; flex-wrap:wrap;
    margin-bottom:1.25rem;
  `;

  bar.innerHTML = `
    <label style="font-size:.82rem; color:var(--c-muted);">Filter by month:</label>
    <select id="month-select" style="
      background:var(--c-surface);
      border:1px solid var(--c-border);
      color:var(--c-text);
      padding:.4rem .85rem;
      border-radius:6px;
      font-family:var(--ff-body);
      font-size:.9rem;
      cursor:pointer;
    ">
      ${months.map(m => `
        <option value="${m}" ${m === _selectedMonth ? 'selected' : ''}>
          ${formatMonth(m)}
        </option>
      `).join('')}
    </select>
  `;

  // Insert before container content
  container.parentNode.insertBefore(bar, container);

  document.getElementById('month-select').addEventListener('change', e => {
    _selectedMonth = e.target.value;
    renderTransactions(filteredRows());
  });
}

// ── Render ────────────────────────────────────────────────────

function renderTransactions(rows) {
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `
      <p class="empty-state">No paid transactions for ${formatMonth(_selectedMonth)}.</p>
    `;
    if (exportBtn) exportBtn._rows = [];
    return;
  }

  const monthRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const monthOrders  = rows.reduce((s, r) => s + r.count,   0);

  container.innerHTML = `

    <!-- Monthly summary bar -->
    <div style="
      display:flex; gap:1.5rem; flex-wrap:wrap;
      background:var(--c-surface);
      border:1px solid var(--c-border);
      border-radius:var(--radius-md);
      padding:1rem 1.25rem;
      margin-bottom:1.25rem;
    ">
      <div>
        <p style="font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--c-muted); margin-bottom:.2rem;">
          ${formatMonth(_selectedMonth)} Revenue
        </p>
        <p style="font-family:var(--ff-display); font-size:1.4rem; color:var(--c-accent-alt); margin:0;">
          &#2547;${monthRevenue.toFixed(2)}
        </p>
      </div>
      <div>
        <p style="font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--c-muted); margin-bottom:.2rem;">
          Paid Orders
        </p>
        <p style="font-family:var(--ff-display); font-size:1.4rem; color:#90c8ff; margin:0;">
          ${monthOrders}
        </p>
      </div>
      <div>
        <p style="font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--c-muted); margin-bottom:.2rem;">
          Days Recorded
        </p>
        <p style="font-family:var(--ff-display); font-size:1.4rem; color:#80e0a0; margin:0;">
          ${rows.length}
        </p>
      </div>
    </div>

    <!-- Table -->
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:.9rem;">
        <thead>
          <tr style="background:var(--c-bg);">
            <th style="text-align:left; padding:.65rem 1rem; border-bottom:2px solid var(--c-accent); color:var(--c-muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em;">Date</th>
            <th style="text-align:center; padding:.65rem 1rem; border-bottom:2px solid var(--c-accent); color:var(--c-muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em;">Paid Orders</th>
            <th style="text-align:right; padding:.65rem 1rem; border-bottom:2px solid var(--c-accent); color:var(--c-muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em;">Revenue</th>
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
            <td style="padding:.75rem 1rem; text-align:center; font-weight:700; color:#90c8ff;">${monthOrders}</td>
            <td style="padding:.75rem 1rem; text-align:right; font-weight:700; color:var(--c-accent-alt); font-family:var(--ff-display); font-size:1.1rem;">
              &#2547;${monthRevenue.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Store currently visible rows for PDF export
  if (exportBtn) exportBtn._rows = rows;
}

// ── PDF Export ────────────────────────────────────────────────

function exportToPDF() {
  const rows = exportBtn?._rows;
  if (!rows || !rows.length) {
    alert('No transaction data to export.');
    return;
  }

  const monthRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const monthOrders  = rows.reduce((s, r) => s + r.count,   0);
  const exportedOn   = new Date().toLocaleDateString('en-BD', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const monthLabel = formatMonth(_selectedMonth);

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
      <title>Transactions — ${monthLabel} — Khana Pina</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:Arial, sans-serif; font-size:13px; color:#111; padding:32px; }
        h1 { font-size:22px; margin-bottom:4px; }
        .subtitle { color:#666; font-size:12px; margin-bottom:24px; }
        .summary { display:flex; gap:32px; margin-bottom:24px; padding:14px 18px; background:#fef6f3; border:1px solid #e8c8b8; border-radius:8px; }
        .summary-item p:first-child { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#888; margin-bottom:2px; }
        .summary-item p:last-child  { font-size:18px; font-weight:700; color:#c9603a; }
        table { width:100%; border-collapse:collapse; }
        thead tr { background:#c9603a; color:#fff; }
        th { padding:9px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
        th:nth-child(2) { text-align:center; }
        th:nth-child(3) { text-align:right; }
        tfoot tr { background:#fef6f3; font-weight:700; }
        td:nth-child(2) { text-align:center; }
        td:nth-child(3) { text-align:right; }
        .footer { margin-top:28px; font-size:11px; color:#aaa; text-align:center; }
        @media print { body { padding:16px; } }
      </style>
    </head>
    <body>
      <h1>Transaction Report — ${monthLabel}</h1>
      <p class="subtitle">Khana Pina Restaurant &nbsp;|&nbsp; Exported on ${exportedOn}</p>

      <div class="summary">
        <div class="summary-item">
          <p>Month Revenue</p>
          <p>&#2547;${monthRevenue.toFixed(2)}</p>
        </div>
        <div class="summary-item">
          <p>Paid Orders</p>
          <p>${monthOrders}</p>
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
            <td style="padding:9px 12px;">${monthOrders}</td>
            <td style="padding:9px 12px;">&#2547;${monthRevenue.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p class="footer">Generated by QR Restaurant System.</p>
      <script>window.onload = function() { window.print(); }</script>
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