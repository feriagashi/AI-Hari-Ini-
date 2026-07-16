CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Berita AI',
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  source_domain TEXT NOT NULL,
  published_at TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  score INTEGER NOT NULL DEFAULT 0,
  cover_variant INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, published_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  errors TEXT
);
