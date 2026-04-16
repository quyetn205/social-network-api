import 'dotenv/config';

// ─── DB Client ────────────────────────────────────────────────────────────────
let _sql;

if (process.env.POSTGRES_URL) {
    const { createClient } = await import('@vercel/postgres');
    const client = createClient();
    await client.connect();
    _sql = client;
} else if (process.env.DATABASE_URL) {
    const postgres = (await import('postgres')).default;
    _sql = postgres(process.env.DATABASE_URL, { prepare: false });
} else {
    console.warn('⚠️  Neither POSTGRES_URL nor DATABASE_URL set');
    _sql = null;
}

// ─── sql tagged template literal ─────────────────────────────────────────────
// @vercel/postgres: result already has { rows, rowCount }
// postgres.js: result is a Result(rows[], count) — we normalize to { rows, count, rowCount }
const sql = async (rawStrings, ...values) => {
    if (!_sql) throw new Error('Database not initialized');
    if (process.env.POSTGRES_URL) {
        return await _sql(rawStrings, ...values);
    } else {
        const result = await _sql(rawStrings, ...values);
        const rows = [...result];
        return { rows, count: result.count, rowCount: result.count };
    }
};

// Unsafe raw SQL — bypasses prepared statement cache (avoids cached plan errors)
export const sqlUnsafe = (...args) => {
    if (!_sql) throw new Error('Database not initialized');
    return _sql.unsafe(...args);
};

// ─── Schema ───────────────────────────────────────────────────────────────────
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
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
`;

const SEED_TOPICS = `
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
`;

let initialized = false;

export async function initDb() {
    if (initialized) return;
    if (!_sql) {
        console.warn('⚠️  initDb skipped: no database connection configured');
        return;
    }
    try {
        await _sql.unsafe('SELECT 1');
    } catch (e) {
        console.error('❌ DB init failed:', e.message);
        return;
    }
    try {
        await _sql.unsafe(SCHEMA);
    } catch (e) {
        if (!e.message.includes('already exists'))
            console.warn('⚠️  Schema:', e.message);
    }
    try {
        await _sql.unsafe(SEED_TOPICS);
    } catch (e) {
        if (!e.message.includes('duplicate'))
            console.warn('⚠️  Seed topics:', e.message);
    }
    // Run each migration separately so one failure doesn't block the rest
    const migrationSteps = [
        'ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0',
        'ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0',
        'UPDATE posts SET created_at = NOW() WHERE created_at IS NULL',
        'ALTER TABLE posts ALTER COLUMN created_at DROP NOT NULL',
        'ALTER TABLE posts ALTER COLUMN created_at SET DEFAULT NOW()',
        'UPDATE posts SET updated_at = NOW() WHERE updated_at IS NULL',
        'ALTER TABLE posts ALTER COLUMN updated_at DROP NOT NULL',
        'ALTER TABLE posts ALTER COLUMN updated_at SET DEFAULT NOW()',
        'ALTER TABLE comments ALTER COLUMN created_at SET DEFAULT NOW()',
        'ALTER TABLE comments ALTER COLUMN created_at DROP NOT NULL',
        'UPDATE comments SET created_at = NOW() WHERE created_at IS NULL',
        'ALTER TABLE likes ALTER COLUMN created_at DROP NOT NULL',
        'ALTER TABLE likes ALTER COLUMN created_at SET DEFAULT NOW()',
        'ALTER TABLE follows ALTER COLUMN created_at DROP NOT NULL',
        'ALTER TABLE follows ALTER COLUMN created_at SET DEFAULT NOW()',
        'ALTER TABLE bookmarks ALTER COLUMN created_at DROP NOT NULL',
        'ALTER TABLE bookmarks ALTER COLUMN created_at SET DEFAULT NOW()',
        'ALTER TABLE notifications ALTER COLUMN created_at DROP NOT NULL',
        'ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT NOW()',
        'ALTER TABLE refresh_tokens ALTER COLUMN created_at DROP NOT NULL',
        'ALTER TABLE refresh_tokens ALTER COLUMN created_at SET DEFAULT NOW()',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE DEFAULT NULL',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE',
        'ALTER TABLE users ALTER COLUMN avatar_url SET DEFAULT NULL',
        'ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()'
    ];
    for (const step of migrationSteps) {
        try {
            await _sql.unsafe(step);
        } catch (e) {
            if (
                !e.message.includes('already exists') &&
                !e.message.includes('does not exist')
            ) {
                console.warn(
                    `⚠️  Migration [${step.slice(0, 40)}]: ${e.message}`
                );
            }
        }
    }
    initialized = true;
    console.log('✅ Database schema ready');
}

export { sql };
