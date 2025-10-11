PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_date TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  account TEXT,
  category TEXT,
  source_file TEXT,
  raw_json TEXT,
  hash TEXT UNIQUE,
  hidden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_hidden ON transactions(hidden);
