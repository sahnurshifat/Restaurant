// ============================================================
// menu.js — Fetch & render menu items for the customer view
// Phase 14: fetches ALL items ONCE, filters in-memory.
//           Zero extra API calls on category change.
// ============================================================

import { supabase } from './supabaseClient.js';
import { addToCart } from './cart.js';

const menuContainer  = document.getElementById('menu-container');
const categoryFilter = document.getElementById('category-filter');

// ── In-memory cache ───────────────────────────────────────────
// Populated on first load. Category filtering reads from here —
// no additional Supabase queries are made after the initial fetch.
let _menuCache = [];   // Array<MenuItem>
let _cacheTime = 0;    // timestamp of last successful fetch

const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 min — re-fetch if stale

// ── State helpers ─────────────────────────────────────────────

function showLoading() {
  if (!menuContainer) return;
  menuContainer.innerHTML = `
    <div style="grid-column:1/-1; padding:2.5rem 0; text-align:center; color:var(--c-muted);">
      <div style="font-size:1.5rem; margin-bottom:.5rem;">⏳</div>
      Loading menu…
    </div>`;
}

function showError(msg) {
  if (!menuContainer) return;
  menuContainer.innerHTML = `
    <div style="grid-column:1/-1; padding:2rem; text-align:center;">
      <p style="color:var(--c-danger); margin-bottom:.75rem;">${msg}</p>
      <button class="btn btn--ghost" onclick="location.reload()">Retry</button>
    </div>`;
}

// ── Fetch (once) ──────────────────────────────────────────────

/**
 * Fetches ALL available menu items from Supabase and caches them.
 * If cache is fresh, returns the cache immediately (no network call).
 * @returns {Promise<Array>}
 */
async function fetchAllItems() {
  const now = Date.now();
  if (_menuCache.length && (now - _cacheTime) < CACHE_TTL_MS) {
    return _menuCache;  // ← cache hit, zero API call
  }

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, description, price, category, image_url')
    .eq('is_available', true)
    .order('category')
    .order('name');

  if (error) {
    console.error('[menu.js] Fetch error:', error.message);
    return null;   // null signals a network/DB error
  }

  _menuCache = data ?? [];
  _cacheTime = Date.now();
  return _menuCache;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Loads (or filters from cache) and renders menu items.
 * Category filtering is done in-memory — NO extra API call.
 * @param {string|null} category
 */
export async function loadMenu(category = null) {
  showLoading();

  const items = await fetchAllItems();

  if (items === null) {
    showError('Failed to load menu. Please try again.');
    return;
  }

  const filtered = category
    ? items.filter(i => i.category === category)
    : items;

  renderMenu(filtered);
}

/**
 * Populates the category filter from cache (no extra DB call).
 * Must be called after loadMenu() so the cache is warm.
 */
export async function loadCategories() {
  if (!categoryFilter) return;

  // Ensure cache is populated
  const items = await fetchAllItems();
  if (!items) return;

  const unique = [...new Set(items.map(r => r.category).filter(Boolean))].sort();

  unique.forEach(cat => {
    const opt = document.createElement('option');
    opt.value       = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });

  // Filter entirely in-memory — zero extra Supabase calls
  categoryFilter.addEventListener('change', e => {
    loadMenu(e.target.value || null);
  });
}

// ── Render ────────────────────────────────────────────────────

/**
 * Phase 13 UI: clean cards, large price, snappy feedback.
 * @param {Array} items
 */
function renderMenu(items) {
  if (!menuContainer) return;

  if (!items.length) {
    menuContainer.innerHTML = `
      <div style="grid-column:1/-1; padding:3rem 0; text-align:center; color:var(--c-muted);">
        No items in this category.
      </div>`;
    return;
  }

  menuContainer.innerHTML = '';

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const card = document.createElement('div');
    card.className  = 'menu-card';
    card.dataset.id = item.id;

    // Phase 13: larger price, cleaner layout, category tag
    card.innerHTML = `
      <img
        src="${item.image_url || 'assets/placeholder.jpg'}"
        alt="${item.name}"
        loading="lazy"
        onerror="this.src='assets/placeholder.png'"
        style="width:100%; height:160px; object-fit:cover;"
      />
      <div class="menu-card__body" style="flex:1; padding:.85rem 1rem .5rem;">
        <div style="
          display:flex; justify-content:space-between;
          align-items:flex-start; gap:.5rem; margin-bottom:.25rem;
        ">
          <h3 style="margin:0; font-size:1rem; line-height:1.3;">${item.name}</h3>
          <span style="
            font-size:1.1rem; font-weight:700;
            color:var(--c-accent-alt); white-space:nowrap;
          ">৳${Number(item.price).toFixed(0)}</span>
        </div>
        ${item.description
          ? `<p style="font-size:.8rem; color:var(--c-muted); margin:0 0 .35rem; line-height:1.4;">
               ${item.description}
             </p>`
          : ''}
        ${item.category
          ? `<span style="
               font-size:.7rem; color:var(--c-muted);
               background:var(--c-bg); border:1px solid var(--c-border);
               border-radius:99px; padding:.1rem .55rem;
             ">${item.category}</span>`
          : ''}
      </div>
      <button class="btn btn--add" data-id="${item.id}"
        style="border-radius:0 0 var(--radius-md) var(--radius-md); width:100%; justify-content:center;">
        + Add to Cart
      </button>
    `;

    // Add-to-cart with instant feedback — no re-render needed
    const addBtn = card.querySelector('.btn--add');
    addBtn.addEventListener('click', () => {
      addToCart({ id: item.id, name: item.name, price: Number(item.price) });
      addBtn.textContent = '✓ Added!';
      addBtn.style.background = 'var(--c-success)';
      addBtn.disabled = true;
      setTimeout(() => {
        addBtn.textContent = '+ Add to Cart';
        addBtn.style.background = '';
        addBtn.disabled = false;
      }, 900);
    });

    fragment.appendChild(card);
  });

  // Single DOM write for entire grid — avoids layout thrashing
  menuContainer.appendChild(fragment);
}
