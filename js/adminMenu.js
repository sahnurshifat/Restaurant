// ============================================================
// adminMenu.js — Menu management: list all items,
//                toggle availability. No delete.
// ============================================================

import { supabase }    from './supabaseClient.js';
import { requireAuth } from './adminAuth.js';

const menuList  = document.getElementById('admin-menu-list');
const itemForm  = document.getElementById('menu-item-form');
const formTitle = document.getElementById('form-title');
let   editingId = null;

await requireAuth();

// ── Fetch + render ────────────────────────────────────────────

/** Fetches ALL menu items (available + hidden) for admin view. */
export async function loadAdminMenu() {
  if (menuList) menuList.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, category, price, description, image_url, is_available')
    .order('category')
    .order('name');

  if (error) {
    console.error('[adminMenu.js] Fetch error:', error.message);
    if (menuList) menuList.innerHTML = '<p class="empty-state error">Failed to load items.</p>';
    return;
  }

  renderAdminMenu(data ?? []);
}

function renderAdminMenu(items) {
  if (!menuList) return;

  if (!items.length) {
    menuList.innerHTML = '<p class="empty-state">No menu items found.</p>';
    return;
  }

  // Group by category for readability
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  menuList.innerHTML = Object.entries(grouped).map(([cat, catItems]) => `
    <!-- Category heading -->
    <div style="
      font-size:.72rem; text-transform:uppercase; letter-spacing:.1em;
      color:var(--c-muted); padding:.6rem 0 .3rem;
      border-bottom:1px solid var(--c-border);
      margin-top:.75rem;
    ">${cat}</div>

    ${catItems.map(item => `
      <div class="admin-item" data-id="${item.id}" style="
        display:grid;
        grid-template-columns: 1fr auto auto auto auto;
        align-items:center;
        gap:.75rem;
        padding:.7rem 0;
        border-bottom:1px solid var(--c-border);
        font-size:.88rem;
        ${!item.is_available ? 'opacity:.5;' : ''}
      ">
        <!-- Name -->
        <span style="font-weight:500; color:var(--c-text);">${item.name}</span>

        <!-- Price -->
        <span style="color:var(--c-accent-alt); white-space:nowrap;">
          ৳${Number(item.price).toFixed(2)}
        </span>

        <!-- Availability badge -->
        <span class="badge badge--${item.is_available ? 'success' : 'danger'}"
          style="white-space:nowrap; min-width:68px; text-align:center;">
          ${item.is_available ? '● Available' : '○ Hidden'}
        </span>

        <!-- Toggle availability button -->
        <button
          class="btn btn--toggle-avail"
          data-id="${item.id}"
          data-current="${item.is_available}"
          style="
            font-size:.78rem; padding:.35rem .75rem;
            background:${item.is_available ? 'var(--c-danger)' : 'var(--c-success)'};
            white-space:nowrap;
          "
        >${item.is_available ? 'Hide' : 'Show'}</button>

        <!-- Edit button -->
        <button
          class="btn btn--edit"
          data-id="${item.id}"
          style="font-size:.78rem; padding:.35rem .75rem;"
        >Edit</button>
      </div>
    `).join('')}
  `).join('');

  // ── Wire toggle buttons ──────────────────────────────────
  menuList.querySelectorAll('.btn--toggle-avail').forEach(btn => {
    btn.addEventListener('click', () =>
      toggleAvailability(btn.dataset.id, btn.dataset.current === 'true', btn)
    );
  });

  // ── Wire edit buttons ────────────────────────────────────
  menuList.querySelectorAll('.btn--edit').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id, items));
  });
}

// ── Toggle availability ───────────────────────────────────────

/**
 * Flips is_available for a single menu item in Supabase,
 * then re-renders the list.
 * @param {string}  itemId
 * @param {boolean} current  — current value (will be flipped)
 * @param {HTMLElement} btn  — button for loading feedback
 */
export async function toggleAvailability(itemId, current, btn) {
  if (btn) {
    btn.disabled    = true;
    btn.textContent = '…';
  }

  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: !current })
    .eq('id', itemId);

  if (error) {
    console.error('[adminMenu.js] Toggle error:', error.message);
    if (btn) {
      btn.disabled    = false;
      btn.textContent = current ? 'Hide' : 'Show';
    }
    return;
  }

  loadAdminMenu();   // re-render with fresh data
}

// ── Edit form ─────────────────────────────────────────────────

function openEditForm(id, items) {
  const item = items.find(i => i.id === id);
  if (!item || !itemForm) return;

  editingId = id;
  if (formTitle) formTitle.textContent = 'Edit Item';

  // Populate each matching form field
  Object.entries(item).forEach(([key, val]) => {
    const el = itemForm.elements[key];
    if (el) el.value = val;
  });

  // Scroll form into view on mobile
  itemForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Saves (insert or update) a menu item. */
export async function saveMenuItem(formData) {
  const payload = {
    name:         formData.get('name'),
    category:     formData.get('category'),
    price:        parseFloat(formData.get('price')),
    description:  formData.get('description'),
    image_url:    formData.get('image_url'),
    is_available: formData.get('is_available') === 'true',
  };

  const query = editingId
    ? supabase.from('menu_items').update(payload).eq('id', editingId)
    : supabase.from('menu_items').insert(payload);

  const { error } = await query;
  if (error) {
    console.error('[adminMenu.js] Save error:', error.message);
    return;
  }

  // Reset form state
  editingId = null;
  itemForm?.reset();
  if (formTitle) formTitle.textContent = 'Add Item';

  loadAdminMenu();
}

// ── Form submit ───────────────────────────────────────────────

if (itemForm) {
  itemForm.addEventListener('submit', e => {
    e.preventDefault();
    saveMenuItem(new FormData(itemForm));
  });
}

// ── Boot ──────────────────────────────────────────────────────

loadAdminMenu();
