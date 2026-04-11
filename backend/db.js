import 'dotenv/config'

// ─── DB Client — supports both Vercel (POSTGRES_URL) and Render (DATABASE_URL) ───
let _sql

if (process.env.POSTGRES_URL) {
  // Vercel environment
  const { createClient } = await import('@vercel/postgres')
  const client = createClient()
  await client.connect()
  _sql = client
} else if (process.env.DATABASE_URL) {
  // Render / any standard PostgreSQL environment using 'postgres' library
  const postgres = (await import('postgres')).default
  _sql = postgres(process.env.DATABASE_URL)
} else {
  throw new Error('Neither POSTGRES_URL nor DATABASE_URL is set')
}

// Tagged template literal — works with @vercel/postgres and postgres.js
// rawStrings[0] is the query with ${placeholders}
// values is the array of interpolated values
const sql = (rawStrings, ...values) => {
  return _sql.unsafe(rawStrings[0], values)
}

// ─── Schema Init ─────────────────────────────────────────────────────────────
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  date_of_birth DATE DEFAULT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  avatar_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_topics (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, topic_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER DEFAULT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_ids INTEGER[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  data JSONB DEFAULT '{}',
  actor_avatar_url VARCHAR(500) DEFAULT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

INSERT INTO topics (name, description) VALUES
  ('Thể thao', 'Các bài viết về thể thao'),
  ('Công nghệ', 'Công nghệ, lập trình, AI'),
  ('Game', 'Tin tức và thảo luận về game'),
  ('Ẩm thực', 'Nấu ăn, đặc sản'),
  ('Du lịch', 'Điểm đến, kinh nghiệm du lịch'),
  ('Âm nhạc', 'Nhạc Việt, nhạc quốc tế'),
  ('Phim ảnh', 'Review phim, tin tức điện ảnh'),
  ('Sách', 'Sách hay, review sách'),
  ('Kinh doanh', 'Khởi nghiệp, đầu tư'),
  ('Giáo dục', 'Học tập, tuyển sinh')
ON CONFLICT (name) DO NOTHING;
`

let initialized = false

export async function initDb() {
  if (initialized) return
  try {
    await _sql.unsafe('SELECT 1')
    await _sql.unsafe(SCHEMA)
    initialized = true
    console.log('✅ Database schema ready')
  } catch (e) {
    console.error('❌ DB init failed:', e.message)
    throw e
  }
}

export { sql }