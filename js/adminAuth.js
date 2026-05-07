// ============================================================
// adminAuth.js — Supabase Auth: login, logout, session guard
// ============================================================

import { supabase } from './supabaseClient.js';

// ── Core auth functions ───────────────────────────────────────

/**
 * Signs in with email + password via Supabase Auth.
 * Throws on failure so the caller can handle the error message.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} Supabase session data
 */
export async function adminLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Signs the current admin out and redirects to login.html.
 */
export async function adminLogout() {
  await supabase.auth.signOut();
  window.location.replace('login.html');
}

/**
 * Route guard for admin-only pages.
 * Checks the active Supabase session; redirects to login.html
 * if no session is found.
 * @returns {Promise<object|null>} Active session or null
 */
export async function requireAuth() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('[adminAuth.js] Session check error:', error.message);
  if (!session) window.location.replace('login.html');
  return session;
}

// ── Login form handler (runs only on login.html) ──────────────

const loginForm   = document.getElementById('login-form');
const errorEl     = document.getElementById('login-error');
const submitBtn   = loginForm?.querySelector('button[type="submit"]');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = loginForm.email.value;
    const password = loginForm.password.value;

    // Clear previous error
    if (errorEl) errorEl.textContent = '';

    // Loading state
    if (submitBtn) {
      submitBtn.disabled    = true;
      submitBtn.textContent = 'Signing in…';
    }

    try {
      await adminLogin(email, password);
      // Redirect on success
      window.location.replace('admin.html');

    } catch (err) {
      // Map common Supabase error codes to friendly messages
      const friendly = friendlyError(err.message);
      if (errorEl) errorEl.textContent = friendly;

      // Restore button
      if (submitBtn) {
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Sign In';
      }

      // Shake the form card for visual feedback
      loginForm.closest('.login-card')?.classList.add('shake');
      setTimeout(() => loginForm.closest('.login-card')?.classList.remove('shake'), 500);
    }
  });
}

// ── Error message helper ──────────────────────────────────────

/**
 * Converts raw Supabase error strings into user-friendly messages.
 * @param {string} msg
 * @returns {string}
 */
function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login'))        return 'Incorrect email or password.';
  if (m.includes('email not confirmed'))  return 'Please confirm your email first.';
  if (m.includes('too many requests'))    return 'Too many attempts. Please wait a moment.';
  if (m.includes('network'))              return 'Network error. Check your connection.';
  return msg;   // fallback: show raw message
}
