# 🍽 QR Restaurant Ordering System

A full frontend-only QR-based restaurant ordering system built with **HTML · CSS · Vanilla JS · Supabase**.

---

## 📁 Project Structure

```
qr-restaurant/
├── assets/                  # Static images & icons
├── css/
│   └── styles.css           # Design system (tokens, layout, components)
├── js/
│   ├── supabaseClient.js    # Supabase singleton (URL + anon key)
│   ├── session.js           # Table session via QR URL param (?table=X)
│   ├── menu.js              # Fetch & render menu items + category filter
│   ├── cart.js              # localStorage-backed cart state & UI
│   ├── checkout.js          # Place order → writes to Supabase
│   ├── invoice.js           # Fetch & display order invoice
│   ├── adminAuth.js         
│   ├── adminOrders.js       # Real-time order list + status updates
│   └── adminMenu.js         # Full CRUD for menu items
├── pages/
│   ├── index.html           # Customer: browse menu + cart + checkout
│   ├── admin.html           # Admin: live orders + menu management tabs
│   ├── login.html           # Admin login form
│   └── invoice.html         # Post-order receipt / printable invoice
└── README.md
```

---

## ⚡ Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/your-org/qr-restaurant.git
cd qr-restaurant
```

### 2. Configure Supabase
Edit `js/supabaseClient.js` and replace the placeholder values:
```js
const SUPABASE_URL     = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

### 3. Create Supabase tables

```sql
-- Tables
create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text,
  price        numeric not null,
  description  text,
  image_url    text,
  is_available boolean default true,
  created_at   timestamptz default now()
);

create table orders (
  id         uuid primary key default gen_random_uuid(),
  table_id   text not null,
  status     text default 'pending', -- pending | preparing | served | cancelled
  total      numeric not null,
  created_at timestamptz default now()
);

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  qty          int not null,
  unit_price   numeric not null
);
```

### 4. Enable Supabase Auth
- Go to **Authentication → Providers** in your Supabase dashboard.
- Enable **Email** provider.
- Create an admin user manually via the Supabase dashboard or `supabase.auth.signUp()`.

### 5. Generate QR Codes
Generate a QR code for each table that points to:
```
https://your-domain.com/pages/index.html?table=TABLE_NUMBER
```

### 6. Serve the project
Use any static server (Live Server, Nginx, Vercel, Netlify, etc.):
```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## 🔐 Row-Level Security (RLS)

Enable RLS on all tables in Supabase and add policies:

| Table        | Operation | Policy                              |
|--------------|-----------|-------------------------------------|
| `menu_items` | SELECT    | Allow public (anon)                 |
| `orders`     | INSERT    | Allow public (anon)                 |
| `orders`     | SELECT/UPDATE | Authenticated (admin) only    |
| `order_items`| INSERT    | Allow public (anon)                 |
| `order_items`| SELECT    | Authenticated (admin) only          |

---

## 🗺 Page Flow

```
Customer scans QR → index.html?table=5
  → browses menu
  → adds to cart (localStorage)
  → clicks Place Order (checkout.js)
  → order written to Supabase
  → redirected to invoice.html

Admin opens login.html
  → authenticates via Supabase Auth
  → redirected to admin.html
  → sees live orders (real-time subscription)
  → updates order status
  → manages menu items (CRUD)
```

---

## 🛠 Tech Stack

| Layer      | Technology                      |
|------------|---------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JS (ESM)   |
| Backend    | Supabase (Postgres + Auth + Realtime) |
| Hosting    | Any static host (Vercel, Netlify, etc.) |
| Fonts      | Google Fonts (Playfair Display + DM Sans) |

---

## 📄 License
MIT — feel free to adapt for your restaurant.
