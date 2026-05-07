-- ==============================================================
-- daily_token.sql
-- Unique daily token system for QR Restaurant orders
--
-- HOW IT WORKS:
--   1. `daily_token_seq` tracks the current counter per day.
--   2. `get_next_daily_token()` atomically increments the counter
--      and returns a zero-padded 3-digit token (001–999).
--   3. The counter resets automatically each new day.
--   4. A DB trigger calls it on every INSERT into `orders`,
--      so the frontend never generates tokens — it just reads
--      `daily_token` from the returned order row.
--
-- RUN ONCE in your Supabase SQL editor.
-- ==============================================================


-- ── 1. Add daily_token column to orders ───────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS daily_token TEXT;


-- ── 2. Daily sequence tracker table ──────────────────────────

CREATE TABLE IF NOT EXISTS daily_token_seq (
  day    DATE    PRIMARY KEY DEFAULT CURRENT_DATE,
  seq    INTEGER NOT NULL    DEFAULT 0
);


-- ── 3. Atomic token generator function ───────────────────────

CREATE OR REPLACE FUNCTION get_next_daily_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq   INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Upsert: insert today's row if missing, then increment
  INSERT INTO daily_token_seq (day, seq)
  VALUES (v_today, 1)
  ON CONFLICT (day)
  DO UPDATE SET seq = daily_token_seq.seq + 1
  RETURNING seq INTO v_seq;

  -- Zero-pad to 3 digits: 001, 002, … 999
  -- If somehow > 999, wrap (edge case: 1000+ orders/day)
  RETURN LPAD(((v_seq - 1) % 999 + 1)::TEXT, 3, '0');
END;
$$;


-- ── 4. Trigger: auto-assign token on order insert ────────────

CREATE OR REPLACE FUNCTION assign_daily_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.daily_token := get_next_daily_token();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_daily_token ON orders;

CREATE TRIGGER trg_assign_daily_token
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.daily_token IS NULL)
  EXECUTE FUNCTION assign_daily_token();


-- ── 5. (Optional) Index for fast token lookups ───────────────

CREATE INDEX IF NOT EXISTS idx_orders_daily_token
  ON orders (daily_token, created_at DESC);


-- ── Verification query (run after migration) ─────────────────
-- SELECT get_next_daily_token();  -- should return '001'
-- SELECT get_next_daily_token();  -- should return '002'
