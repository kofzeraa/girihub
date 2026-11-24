// Migração inicial do núcleo. Novos passos devem ser ADICIONADOS ao fim da lista (nunca editar os antigos).
export const coreMigrations = [
  `
CREATE TABLE users(
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin')),
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE password_resets(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE user_tags(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, tag_id)
);
CREATE TABLE badges(
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🏅',
  source TEXT NOT NULL DEFAULT 'achievable' CHECK(source IN ('achievable','purchasable','admin')),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE user_badges(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, badge_id)
);
CREATE TABLE verification_requests(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by INTEGER REFERENCES users(id)
);
CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE videos(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  poster_url TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  views INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX videos_feed ON videos(status, created_at DESC);
CREATE INDEX videos_user ON videos(user_id, created_at DESC);
CREATE TABLE video_likes(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, video_id)
);
CREATE TABLE comments(
  id INTEGER PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX comments_video ON comments(video_id, id DESC);
CREATE TABLE follows(
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(follower_id, followee_id),
  CHECK(follower_id <> followee_id)
);
CREATE INDEX follows_followee ON follows(followee_id);
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE wallet_tx(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount <> 0),
  balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  idem_key TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, idem_key)
);
CREATE INDEX wallet_tx_user ON wallet_tx(user_id, id DESC);
CREATE TABLE watch_sessions(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  accumulated_ms INTEGER NOT NULL DEFAULT 0,
  last_beat INTEGER NOT NULL,
  rewarded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, video_id)
);
CREATE TABLE shop_categories(
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🛍️',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE products(
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES shop_categories(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK(price >= 0),
  badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX products_cat ON products(category_id, active);
CREATE TABLE purchases(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  price_paid INTEGER NOT NULL,
  tx_id INTEGER REFERENCES wallet_tx(id),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, product_id)
);
`,
];
