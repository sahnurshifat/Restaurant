// ============================================================
// adminDashboard.js — Sales Dashboard
// Shows: total revenue today, total orders today,
//        best selling item today.
// Refreshes every 30 seconds automatically.
// ============================================================

import { supabase }    from './supabaseClient.js';
import { requireAuth } from './adminAuth.js';

await requireAuth();

const container = document.getElementById('dashboard-container');

// ── Polling ───────────────────────────────────────────────────

const REFRESH_MS = 30000;
let   _timer     = null;

export async function initDashboard() {
  await fetchStats();
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    await fetchStats();
    schedulePoll();
  }, REFRESH_MS);
}

// ── Date range ────────────────────────────────────────────────

function todayRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,  0,  0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── Fetch ─────────────────────────────────────────────────────

async function fetchStats() {
  const { start, end } = todayRange();

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      total,
      order_items (
        qty,
        menu_items ( name )
      )
    `)
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) {
    console.error('[adminDashboard.js] Fetch error:', error.message);
    showError('Failed to load dashboard stats.');
    return;
  }

  const stats = calculateStats(orders ?? []);
  renderDashboard(stats);
}

// ── Calculate ─────────────────────────────────────────────────

function calculateStats(orders) {
  // Total orders
  const totalOrders = orders.length;

  // Total revenue — count paid and served orders only
  const totalRevenue = orders
    .filter(o => o.status === 'paid' || o.status === 'served')
    .reduce((sum, o) => sum + Number(o.total), 0);

  // Best selling item — tally qty per item name across all orders
  const itemTally = {};
  orders.forEach(order => {
    (order.order_items || []).forEach(item => {
      const name = item.menu_items?.name;
      if (!name) return;
      itemTally[name] = (itemTally[name] || 0) + item.qty;
    });
  });

  let bestItem     = 'No orders yet';
  let bestItemQty  = 0;

  Object.entries(itemTally).forEach(([name, qty]) => {
    if (qty > bestItemQty) {
      bestItem    = name;
      bestItemQty = qty;
    }
  });

  return { totalOrders, totalRevenue, bestItem, bestItemQty };
}

// ── Render ────────────────────────────────────────────────────

function renderDashboard({ totalOrders, totalRevenue, bestItem, bestItemQty }) {
  if (!container) return;

  const now = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  container.innerHTML = `

    <!-- Refresh stamp -->
    <p style="
      font-size:.75rem; color:var(--c-muted);
      text-align:right; margin-bottom:1.25rem;
    ">Last updated: ${now}</p>

    <!-- Stat cards grid -->
    <div style="
      display:grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap:1.25rem;
      margin-bottom:2rem;
    ">

      <!-- Total Revenue -->
      <div style="
        background:var(--c-surface);
        border:1px solid var(--c-border);
        border-top: 3px solid var(--c-accent);
        border-radius:var(--radius-md);
        padding:1.25rem 1.5rem;
      ">
        <p style="
          font-size:.72rem; text-transform:uppercase;
          letter-spacing:.1em; color:var(--c-muted);
          margin-bottom:.5rem;
        ">Total Revenue Today</p>
        <p style="
          font-family:var(--ff-display);
          font-size:2rem; font-weight:700;
          color:var(--c-accent-alt);
          margin:0;
        ">
          &#2547;${totalRevenue.toFixed(2)}
        </p>
        <p style="font-size:.78rem; color:var(--c-muted); margin-top:.4rem;">
          From paid and served orders
        </p>
      </div>

      <!-- Total Orders -->
      <div style="
        background:var(--c-surface);
        border:1px solid var(--c-border);
        border-top: 3px solid #4a6a8a;
        border-radius:var(--radius-md);
        padding:1.25rem 1.5rem;
      ">
        <p style="
          font-size:.72rem; text-transform:uppercase;
          letter-spacing:.1em; color:var(--c-muted);
          margin-bottom:.5rem;
        ">Total Orders Today</p>
        <p style="
          font-family:var(--ff-display);
          font-size:2rem; font-weight:700;
          color:#90c8ff;
          margin:0;
        ">${totalOrders}</p>
        <p style="font-size:.78rem; color:var(--c-muted); margin-top:.4rem;">
          All statuses included
        </p>
      </div>

      <!-- Best Selling Item -->
      <div style="
        background:var(--c-surface);
        border:1px solid var(--c-border);
        border-top: 3px solid var(--c-success);
        border-radius:var(--radius-md);
        padding:1.25rem 1.5rem;
      ">
        <p style="
          font-size:.72rem; text-transform:uppercase;
          letter-spacing:.1em; color:var(--c-muted);
          margin-bottom:.5rem;
        ">Best Selling Item</p>
        <p style="
          font-family:var(--ff-display);
          font-size:1.4rem; font-weight:700;
          color:#80e0a0;
          margin:0; line-height:1.3;
        ">${bestItem}</p>
        <p style="font-size:.78rem; color:var(--c-muted); margin-top:.4rem;">
          ${bestItemQty > 0 ? `${bestItemQty} sold today` : 'No items ordered yet'}
        </p>
      </div>

    </div>
  `;
}

// ── Error ─────────────────────────────────────────────────────

function showError(msg) {
  if (container) {
    container.innerHTML = `<p class="empty-state error">${msg}</p>`;
  }
}

// ── Boot ──────────────────────────────────────────────────────

initDashboard();
