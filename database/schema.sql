CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  role TEXT NOT NULL DEFAULT 'nasabah'
    CHECK (role IN ('admin', 'petugas', 'nasabah')),
  balance_points REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS waste_categories (
  category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,
  description TEXT,
  points_per_kg REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pickup_transactions (
  transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  petugas_id INTEGER,
  pickup_date TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'picked_up', 'completed', 'cancelled')),
  total_points REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (petugas_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pickups_user_created
  ON pickup_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pickups_status_date
  ON pickup_transactions(status, pickup_date);

CREATE TABLE IF NOT EXISTS transaction_details (
  detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  points_per_kg_snapshot REAL NOT NULL,
  points_earned REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (transaction_id) REFERENCES pickup_transactions(transaction_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES waste_categories(category_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_details_transaction ON transaction_details(transaction_id);

CREATE TABLE IF NOT EXISTS point_redemptions (
  redemption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reward_id TEXT NOT NULL,
  reward_name TEXT NOT NULL,
  points_spent REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processed', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON point_redemptions(user_id, created_at);

INSERT OR IGNORE INTO waste_categories (category_name, description, points_per_kg) VALUES
  ('Plastik', 'Botol, gelas, dan kemasan plastik bersih', 120),
  ('Kertas', 'Kardus, koran, dan kertas kering', 85),
  ('Logam', 'Kaleng dan logam non-berbahaya', 240),
  ('Kaca', 'Botol dan wadah kaca', 65),
  ('Organik', 'Sisa organik untuk pengolahan kompos', 35);
