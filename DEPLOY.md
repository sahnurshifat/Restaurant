# 🚀 Deployment Guide
### QR Restaurant → Supabase + GitHub + Netlify

---

## BEFORE YOU START — Checklist

- [ ] You have a [Supabase account](https://supabase.com) (free)
- [ ] You have a [GitHub account](https://github.com) (free)
- [ ] You have a [Netlify account](https://netlify.com) (free)
- [ ] Your project folder is on your computer (the `qr-restaurant/` folder)

**Total time: ~30 minutes**

---

## PHASE 1 — SUPABASE DATABASE SETUP

### Step 1 — Log into Supabase

Go to [supabase.com](https://supabase.com) → click **Sign In** → open your project dashboard.

Your project is already linked. The credentials in `js/supabaseClient.js` already point to:
```
Project: kmorjmmznaiukhxkhttg
URL:     https://kmorjmmznaiukhxkhttg.supabase.co
```

---

### Step 2 — Create the database tables

In your Supabase dashboard:
1. Click **SQL Editor** in the left sidebar
2. Click **+ New query**
3. Paste the entire block below and click **Run** (▶)

```sql
-- ── Core tables ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS menu_items (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL,
  category     TEXT,
  price        NUMERIC NOT NULL CHECK (price > 0),
  description  TEXT,
  image_url    TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       TEXT    NOT NULL,
  status         TEXT    DEFAULT 'pending'
                         CHECK (status IN ('pending','preparing','served','paid','cancelled')),
  payment_method TEXT,
  total          NUMERIC NOT NULL CHECK (total >= 0),
  daily_token    TEXT,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID    REFERENCES orders(id)     ON DELETE CASCADE,
  menu_item_id UUID    REFERENCES menu_items(id) ON DELETE SET NULL,
  qty          INT     NOT NULL CHECK (qty > 0),
  unit_price   NUMERIC NOT NULL CHECK (unit_price > 0)
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   TEXT    NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  closed_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

✅ You should see **"Success. No rows returned"** — that means it worked.

---

### Step 3 — Run the daily token migration

Still in SQL Editor → **+ New query** → paste this → **Run**:

```sql
-- daily_token.sql (contents of supabase_migrations/daily_token.sql)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS daily_token TEXT;

CREATE TABLE IF NOT EXISTS daily_token_seq (
  day  DATE    PRIMARY KEY DEFAULT CURRENT_DATE,
  seq  INTEGER NOT NULL    DEFAULT 0
);

CREATE OR REPLACE FUNCTION get_next_daily_token()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_seq   INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  INSERT INTO daily_token_seq (day, seq)
  VALUES (v_today, 1)
  ON CONFLICT (day)
  DO UPDATE SET seq = daily_token_seq.seq + 1
  RETURNING seq INTO v_seq;
  RETURN LPAD(((v_seq - 1) % 999 + 1)::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION assign_daily_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
```

✅ **Verify it works** — run this test query:
```sql
SELECT get_next_daily_token();  -- should return: 001
SELECT get_next_daily_token();  -- should return: 002
```

---

### Step 4 — Set up Row Level Security (RLS)

In SQL Editor → **+ New query** → paste → **Run**:

```sql
-- Enable RLS on all tables
ALTER TABLE menu_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;

-- menu_items: anyone can read, only authenticated (admin) can write
CREATE POLICY "Public read menu"
  ON menu_items FOR SELECT USING (TRUE);

CREATE POLICY "Admin write menu"
  ON menu_items FOR ALL
  USING (auth.role() = 'authenticated');

-- orders: anyone can insert (place order), only admin can read/update
CREATE POLICY "Public insert orders"
  ON orders FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Admin read orders"
  ON orders FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin update orders"
  ON orders FOR UPDATE
  USING (auth.role() = 'authenticated');

-- order_items: anyone can insert, only admin can read
CREATE POLICY "Public insert order_items"
  ON order_items FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Admin read order_items"
  ON order_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- table_sessions: anyone can insert, only admin can update/read
CREATE POLICY "Public insert sessions"
  ON table_sessions FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Admin manage sessions"
  ON table_sessions FOR ALL
  USING (auth.role() = 'authenticated');
```

---

### Step 5 — Enable Realtime on orders table

1. In Supabase left sidebar → **Database** → **Replication**
2. Under **Tables**, find `orders`
3. Toggle it **ON**

This powers the live order updates in the admin panel.

---

### Step 6 — Create the admin user

1. Left sidebar → **Authentication** → **Users**
2. Click **+ Add user** → **Create new user**
3. Enter:
   - Email: `admin@yourrestaurant.com` (use a real email you own)
   - Password: something strong (12+ chars)
4. Click **Create user**

> ⚠️ Do NOT use "Send invite" — use "Create new user" directly so the account is confirmed immediately.

---

### Step 7 — Add sample menu items (optional but recommended for testing)

SQL Editor → **+ New query**:

```sql
INSERT INTO menu_items (name, category, price, description, is_available) VALUES
  ('Chicken Burger',    'Mains',   180, 'Crispy fried chicken in a toasted bun',   TRUE),
  ('Beef Burger',       'Mains',   220, 'Juicy beef patty with special sauce',      TRUE),
  ('Veggie Wrap',       'Mains',   150, 'Fresh vegetables in a grilled wrap',       TRUE),
  ('French Fries',      'Sides',    80, 'Golden crispy fries with dipping sauce',   TRUE),
  ('Onion Rings',       'Sides',    90, 'Crispy beer-battered onion rings',         TRUE),
  ('Coca-Cola',         'Drinks',   60, '330ml chilled',                            TRUE),
  ('Mango Juice',       'Drinks',   70, 'Fresh mango blend',                        TRUE),
  ('Chocolate Brownie', 'Desserts', 120, 'Warm brownie with vanilla ice cream',     TRUE);
```

---

## PHASE 2 — GITHUB SETUP

### Step 8 — Create a GitHub repository

1. Go to [github.com](https://github.com) → click **+** → **New repository**
2. Settings:
   - **Repository name:** `qr-restaurant`
   - **Visibility:** Private ← important (keeps your Supabase key off the public internet)
   - **Initialize:** leave all checkboxes **unchecked**
3. Click **Create repository**

---

### Step 9 — Create a .gitignore file

In your `qr-restaurant/` folder, create a file named `.gitignore` with this content:

```
# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# No secrets in git (even though anon key is safe to expose,
# good habit for future service keys)
.env
.env.local
```

---

### Step 10 — Push the project to GitHub

Open a terminal (or Git Bash on Windows) inside your `qr-restaurant/` folder:

```bash
# 1. Initialise git
git init

# 2. Stage all files
git add .

# 3. First commit
git commit -m "Initial commit — QR Restaurant"

# 4. Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/qr-restaurant.git

# 5. Push
git branch -M main
git push -u origin main
```

✅ Refresh your GitHub repo page — you should see all files.

---

## PHASE 3 — NETLIFY DEPLOYMENT

### Step 11 — Connect Netlify to GitHub

1. Go to [netlify.com](https://netlify.com) → **Log in**
2. Click **Add new site** → **Import an existing project**
3. Click **Deploy with GitHub**
4. Authorise Netlify to access GitHub if prompted
5. Search for and select `qr-restaurant`

---

### Step 12 — Configure build settings

On the "Configure your site" screen:

| Setting | Value |
|---|---|
| Branch to deploy | `main` |
| Base directory | *(leave empty)* |
| Build command | *(leave empty)* |
| Publish directory | `.` |

> This is a static site with no build step — Netlify just serves the files directly.

Click **Deploy site**.

---

### Step 13 — Wait for deploy (< 1 minute)

Netlify will show a deploy log. When it says **"Published"** your site is live at a URL like:
```
https://random-name-123456.netlify.app
```

---

### Step 14 — Set your custom domain name (optional)

1. In Netlify → **Domain management** → **Add custom domain**
2. Enter your domain (e.g. `bistro.yourdomain.com`)
3. Follow Netlify's DNS instructions for your domain registrar
4. Netlify provisions a free SSL certificate automatically (~5 min)

---

### Step 15 — Update Supabase allowed URLs

1. In Supabase → **Authentication** → **URL Configuration**
2. Add to **Site URL**:
   ```
   https://your-netlify-url.netlify.app
   ```
3. Add to **Redirect URLs**:
   ```
   https://your-netlify-url.netlify.app/pages/admin.html
   ```
4. Click **Save**

---

## PHASE 4 — GENERATE QR CODES

### Step 16 — Create QR codes for each table

Each table needs a QR code pointing to:
```
https://your-netlify-url.netlify.app/pages/index.html?table=1
https://your-netlify-url.netlify.app/pages/index.html?table=2
https://your-netlify-url.netlify.app/pages/index.html?table=3
```

**Free QR generators:**
- [qr-code-generator.com](https://www.qr-code-generator.com)
- [qrcode-monkey.com](https://www.qrcode-monkey.com) ← supports logo in center
- [goqr.me](https://goqr.me)

**Recommended settings:**
- Format: **PNG**, 1000×1000px minimum for print quality
- Error correction: **H (High)** — works even if slightly damaged
- Download and print one per table, laminate if possible

---

## PHASE 5 — FINAL TEST (end-to-end)

### Step 17 — Test the full flow

**Customer flow:**
1. On your phone → scan Table 1 QR code
2. Menu should load within 2 seconds
3. Add 2–3 items to cart
4. Tap "Place Order" → checkout popup opens
5. Select payment method → "Confirm Order"
6. Token screen shows (e.g. **024**)
7. Invoice loads with correct items + totals

**Admin flow:**
1. Open `https://your-netlify-url.netlify.app/pages/login.html`
2. Log in with the email/password from Step 6
3. Order from Step 17 should appear with the same token number
4. Click "🔥 Preparing" → status updates in real-time
5. Click "💚 Mark as Paid" → order dims and shows "💚 Paid"

---

## PHASE 6 — EVERY TIME YOU MAKE A CHANGE

### Step 18 — Deploy updates

Any time you edit code, just push to GitHub and Netlify auto-deploys:

```bash
git add .
git commit -m "Describe what you changed"
git push
```

Netlify detects the push and redeploys in ~30 seconds. Zero manual work.

---

## TROUBLESHOOTING

| Problem | Fix |
|---|---|
| Menu shows "Failed to load" | Check RLS policies in Supabase → Table Editor → `menu_items` |
| Order insert fails (403) | RLS `Public insert orders` policy missing — re-run Step 4 SQL |
| Admin login fails | Check user exists in Supabase Auth → Users. Use "Create new user" not "Invite" |
| Token shows undefined | Run the `daily_token.sql` migration (Step 3), check `orders` table has `daily_token` column |
| Realtime orders not updating | Enable Replication for `orders` table (Step 5) |
| Page shows blank / invisible | Auth check failing — open browser console (F12) for the error message |
| CORS errors | Add your Netlify URL to Supabase → Auth → URL Configuration (Step 15) |

---

## SECURITY NOTES

**The `SUPABASE_ANON_KEY` in your code is intentionally public.** It is designed to be exposed in frontend code. It is only as powerful as your RLS policies allow — which is why Step 4 is critical.

**Never commit a `service_role` key to any file.** That key bypasses RLS entirely and should only ever be used in a secure server-side environment.

---

## YOUR LIVE URLS AFTER DEPLOY

| Page | URL |
|---|---|
| Customer menu (Table 1) | `https://YOUR-SITE.netlify.app/pages/index.html?table=1` |
| Admin dashboard | `https://YOUR-SITE.netlify.app/pages/admin.html` |
| Admin login | `https://YOUR-SITE.netlify.app/pages/login.html` |
| Invoice (auto) | `https://YOUR-SITE.netlify.app/pages/invoice.html?order=ORDER_ID` |
