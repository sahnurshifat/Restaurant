// ============================================================
// supabaseClient.js — Supabase initialization (singleton)
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL     = 'https://kmorjmmznaiukhxkhttg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imttb3JqbW16bmFpdWtoeGtodHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODI4NzksImV4cCI6MjA5MzU1ODg3OX0.1nuq4Wmmt0U7A5Bz_fcbC4XHEmt9UHo8ymZ28Daw7ic';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
