import 'dotenv/config'
import { NextResponse } from 'next/server'
import { initDb, sql } from './db.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const SECRET = process.env.SECRET_KEY || 'fallback-secret'
const ALGORITHM = process.env.ALGORITHM || 'HS256'
const EXPIRE_MINUTES = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '15', 10)

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
function signToken(userId, type = 'access') {
  const expiresIn = type === 'refresh' ? '7d' : `${EXPIRE_MINUTES}m`
  return jwt.sign({ sub: userId, type }, SECRET, { algorithm: ALGORITHM, expiresIn })
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET, { algorithms: [ALGORITHM] })
  } catch {
    return null
  }
}

async function getUserFromToken(request) {
  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const payload = verifyToken(auth.slice(7))
  if (!payload) return null
  const { rows } = await sql`SELECT * FROM users WHERE id = ${payload.sub}`
  return rows[0] || null
}

// ─── Notification Helper ──────────────────────────────────────────────────────
async function createNotification(userId, type, data, actorAvatarUrl) {
  await sql`INSERT INTO notifications (user_id, type, data, actor_avatar_url) VALUES (${userId}, ${type}, ${JSON.stringify(data)}, ${actorAvatarUrl || null})`
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────
const rateLimits = new Map()
const loginLimits = new Map()
function checkRateLimit(ip, max = 100, windowMs = 15 * 60 * 1000) {
  const now = Date.now()
  const record = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs }
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs }
  record.count++
  rateLimits.set(ip, record)
  if (record.count > max) return { limited: true, retryAfter: Math.ceil((record.resetAt - now) / 1000) }
  return { limited: false }
}
function checkLoginLimit(ip) {
  const now = Date.now()
  const record = loginLimits.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 }
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + 15 * 60 * 1000 }
  record.count++
  loginLimits.set(ip, record)
  if (record.count > 10) return { limited: true, retryAfter: Math.ceil((record.resetAt - now) / 1000) }
  return { limited: false }
}

// ─── XSS Sanitizer ──────────────────────────────────────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return str
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ─── Response helpers ─────────────────────────────────────────────────────────
function ok(data) { return NextResponse.json(data) }
function created(data) { return NextResponse.json(data, { status: 201 }) }
function noContent() { return new NextResponse(null, { status: 204 }) }
function err(status, msg) { return NextResponse.json({ detail: msg }, { status }) }
function rateLimitResponse(retryAfter) {
  return NextResponse.json({ detail: 'Too many requests. Please try again later.' }, {
    status: 429,
    headers: { 'Retry-After': String(retryAfter) },
  })
}

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
async function POST_auth_register(request) {
  const body = await request.json()
  const { username, email, password, date_of_birth } = body

  // ── Input validation ──
  if (!username || !email || !password) {
    return err(400, 'username, email, and password are required')
  }
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
    return err(400, 'Username must be 4–20 characters: letters, numbers, and underscore only')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err(400, 'Invalid email format')
  }
  if (password.length < 8) {
    return err(400, 'Password must be at least 8 characters')
  }

  try {
    const hashed = await bcrypt.hash(password, 10)
    const { rows } = await sql`
      INSERT INTO users (username, email, hashed_password, date_of_birth)
      VALUES (${username}, ${email}, ${hashed}, ${date_of_birth || null})
      RETURNING id, username, email, date_of_birth, is_admin, created_at`
    return created(rows[0])
  } catch (e) {
    if (e.code === '23505') {
      const field = e.constraint?.includes('username') ? 'Username' : 'Email'
      return err(400, `${field} already registered`)
    }
    return err(500, 'Registration failed')
  }
}

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
async function POST_auth_login(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  const limited = checkLoginLimit(ip)
  if (limited.limited) return rateLimitResponse(limited.retryAfter)

  const body = await request.json()
  const { username, password } = body

  const { rows } = await sql`SELECT * FROM users WHERE username = ${username}`
  const user = rows[0]
  if (!user) return err(401, 'Incorrect username or password')

  const valid = await bcrypt.compare(password, user.hashed_password)
  if (!valid) return err(401, 'Incorrect username or password')

  const access_token = signToken(user.id, 'access')
  const refresh_token = signToken(user.id, 'refresh')

  // Store refresh token hash in DB
  const tokenHash = await bcrypt.hash(refresh_token, 10)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await sql`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (${user.id}, ${tokenHash}, ${expiresAt})`

  return ok({ access_token, refresh_token, token_type: 'bearer', expires_in: 900 })
}

// ─── GET /api/v1/users/me ─────────────────────────────────────────────────────
async function GET_users_me(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  return ok({
    id: user.id, username: user.username, email: user.email,
    avatar_url: user.avatar_url || '',
    date_of_birth: user.date_of_birth, is_admin: user.is_admin, created_at: user.created_at,
  })
}

// ─── PUT /api/v1/users/me ─────────────────────────────────────────────────────
async function PUT_update_me(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const body = await request.json()
  const { username, date_of_birth, avatar_url } = body

  if (username !== undefined) {
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      return err(400, 'Username must be 4–20 characters: letters, numbers, and underscore only')
    }
    const { rows: existing } = await sql`
      SELECT id FROM users WHERE username = ${username} AND id != ${user.id}`
    if (existing.length > 0) return err(400, 'Username already taken')
  }

  const { rows } = await sql`
    UPDATE users SET
      username = COALESCE(${username}, username),
      avatar_url = COALESCE(${avatar_url}, avatar_url),
      date_of_birth = COALESCE(${date_of_birth}, date_of_birth)
    WHERE id = ${user.id}
    RETURNING id, username, email, avatar_url, date_of_birth, is_admin, created_at`
  return ok(rows[0])
}

// ─── DELETE /api/v1/users/me ──────────────────────────────────────────────────
async function DELETE_delete_me(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  await sql`DELETE FROM users WHERE id = ${user.id}`
  return ok({ success: true })
}

// ─── GET /api/v1/users/{id} ─────────────────────────────────────────────────
async function GET_user_by_id(request, id) {
  const { rows } = await sql`SELECT id, username, email, avatar_url, date_of_birth, is_admin, created_at FROM users WHERE id = ${id}`
  if (!rows[0]) return err(404, 'User not found')
  return ok(rows[0])
}

// ─── GET /api/v1/users/{id}/profile ──────────────────────────────────────────
async function GET_user_profile(request, id) {
  const { rows } = await sql`SELECT id, username, email, avatar_url, date_of_birth, is_admin, created_at FROM users WHERE id = ${id}`
  if (!rows[0]) return err(404, 'User not found')

  const [{ count: followers_count }] = await sql`SELECT COUNT(*) as count FROM follows WHERE following_id = ${id}`
  const [{ count: following_count }] = await sql`SELECT COUNT(*) as count FROM follows WHERE follower_id = ${id}`
  const [{ count: posts_count }] = await sql`SELECT COUNT(*) as count FROM posts WHERE author_id = ${id}`

  return ok({ ...rows[0], followers_count: parseInt(followers_count), following_count: parseInt(following_count), posts_count: parseInt(posts_count) })
}

// ─── GET /api/v1/users/{id}/posts/ ────────────────────────────────────────────
async function GET_user_posts(request, userId) {
  await getUserFromToken(request) // verify auth only

  const { rows: target } = await sql`SELECT id FROM users WHERE id = ${userId}`
  if (!target[0]) return err(404, 'User not found')

  const url = new URL(request.url)
  const skip = parseInt(url.searchParams.get('skip') || url.searchParams.get('cursor') || '0', 10)
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  const { rows: userPosts } = await sql`
    SELECT p.*,
      u.id as "author.id", u.username as "author.username", u.email as "author.email",
      u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.author_id = ${userId}
    ORDER BY p.created_at DESC
    OFFSET ${skip} LIMIT ${limit + 1}`

  const hasMore = userPosts.length > limit
  const items = userPosts.slice(0, limit).map(p => ({
    id: p.id, content: p.content, author_id: p.author_id, created_at: p.created_at, updated_at: p.updated_at,
    likes_count: p.likes_count, comments_count: p.comments_count, topics: [],
    author: { id: p['author.id'], username: p['author.username'], email: p['author.email'],
      date_of_birth: p['author.date_of_birth'], is_admin: p['author.is_admin'], created_at: p['author.created_at'] },
  }))

  return ok({ items, next_cursor: hasMore ? skip + limit : null })
}

// ─── GET /api/v1/users/search?q= ────────────────────────────────────────────
async function GET_search_users(request) {
  const me = await getUserFromToken(request)
  if (!me) return err(401, 'Could not validate credentials')

  const url = new URL(request.url)
  const q = url.searchParams.get('q') || ''
  if (!q) return ok([])

  const { rows } = await sql`
    SELECT id, username, email, created_at FROM users
    WHERE username ILIKE ${'%' + q + '%'}
    LIMIT 20`
  return ok(rows)
}

// ─── GET /api/v1/posts/feed ───────────────────────────────────────────────────
async function GET_feed(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  // Get user preferred topics
  const { rows: prefRows } = await sql`SELECT topic_ids FROM user_preferences WHERE user_id = ${user.id}`
  const preferredTopicIds = prefRows[0]?.topic_ids || []

  // Get following IDs
  const { rows: followRows } = await sql`SELECT following_id FROM follows WHERE follower_id = ${user.id}`
  const followingIds = followRows.map(f => f.following_id)

  // Get topics
  const { rows: postTopics } = await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`
  const topicsMap = {}
  for (const pt of postTopics) {
    if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = []
    topicsMap[pt.post_id].push({ id: pt.id, name: pt.name, description: pt.description })
  }

  // Get posts
  let postsQuery
  if (cursor) {
    postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`
  } else {
    postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`
  }

  const { rows: allPosts } = await postsQuery
  const hasMore = allPosts.length > limit
  const items = allPosts.slice(0, limit).map(post => {
    let score = 0
    if (followingIds.includes(post.author_id)) score += 1
    const postTopicIds = (topicsMap[post.id] || []).map(t => t.id)
    if (postTopicIds.some(id => preferredTopicIds.includes(id))) score += 2
    return {
      id: post.id, content: post.content, author_id: post.author_id,
      created_at: post.created_at, updated_at: post.updated_at,
      likes_count: post.likes_count, comments_count: post.comments_count,
      topics: topicsMap[post.id] || [],
      author: { id: post['author.id'], username: post['author.username'], email: post['author.email'],
        date_of_birth: post['author.date_of_birth'], is_admin: post['author.is_admin'], created_at: post['author.created_at'] },
      feed_score: score,
    }
  })

  items.sort((a, b) => b.feed_score - a.feed_score || new Date(b.created_at) - new Date(a.created_at))
  const next_cursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null
  return ok({ items, next_cursor })
}

// ─── GET /api/v1/posts/search ──────────────────────────────────────────────────
async function GET_search_posts(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const url = new URL(request.url)
  const q = url.searchParams.get('q') || ''
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  let postsQuery
  if (cursor) {
    postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.content ILIKE ${'%' + q + '%'} AND p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`
  } else {
    postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.content ILIKE ${'%' + q + '%'}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`
  }

  const { rows } = await postsQuery
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)

  const { rows: postTopics } = await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`
  const topicsMap = {}
  for (const pt of postTopics) {
    if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = []
    topicsMap[pt.post_id].push({ id: pt.id, name: pt.name, description: pt.description })
  }

  const posts = items.map(p => ({
    id: p.id, content: p.content, author_id: p.author_id, created_at: p.created_at, updated_at: p.updated_at,
    likes_count: p.likes_count, comments_count: p.comments_count,
    topics: topicsMap[p.id] || [],
    author: { id: p['author.id'], username: p['author.username'], email: p['author.email'],
      date_of_birth: p['author.date_of_birth'], is_admin: p['author.is_admin'], created_at: p['author.created_at'] },
  }))

  const next_cursor = hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null
  return ok({ items: posts, next_cursor })
}

// ─── GET /api/v1/posts/explore ─────────────────────────────────────────────────
async function GET_explore(request) {
  await getUserFromToken(request) // verify auth

  const url = new URL(request.url)
  const topicId = url.searchParams.get('topic_id')
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)

  let postsQuery
  if (topicId) {
    const tid = parseInt(topicId, 10)
    if (cursor) {
      postsQuery = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
          u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        JOIN post_topics pt ON pt.post_id = p.id
        WHERE pt.topic_id = ${tid} AND p.created_at < ${cursor}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`
    } else {
      postsQuery = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
          u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        JOIN post_topics pt ON pt.post_id = p.id
        WHERE pt.topic_id = ${tid}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`
    }
  } else {
    if (cursor) {
      postsQuery = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
          u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.created_at < ${cursor}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`
    } else {
      postsQuery = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
          u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`
    }
  }

  const { rows } = await postsQuery
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)

  const { rows: postTopics } = await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`
  const topicsMap = {}
  for (const pt of postTopics) {
    if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = []
    topicsMap[pt.post_id].push({ id: pt.id, name: pt.name, description: pt.description })
  }

  const posts = items.map(p => ({
    id: p.id, content: p.content, author_id: p.author_id, created_at: p.created_at, updated_at: p.updated_at,
    likes_count: p.likes_count, comments_count: p.comments_count,
    topics: topicsMap[p.id] || [],
    author: { id: p['author.id'], username: p['author.username'], email: p['author.email'],
      date_of_birth: p['author.date_of_birth'], is_admin: p['author.is_admin'], created_at: p['author.created_at'] },
  }))

  const next_cursor = hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null
  return ok({ items: posts, next_cursor })
}

// ─── POST /api/v1/posts/ ─────────────────────────────────────────────────────
async function POST_create_post(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const body = await request.json()
  const { content, topic_ids } = body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return err(400, 'Content is required')
  }
  if (content.trim().length > 5000) {
    return err(400, 'Content must not exceed 5000 characters')
  }

  const { rows } = await sql`
    INSERT INTO posts (content, author_id)
    VALUES (${content}, ${user.id})
    RETURNING *`
  const post = rows[0]

  if (topic_ids?.length) {
    const values = topic_ids.map(tid => `(${post.id}, ${tid})`).join(',')
    if (values) await sql`INSERT INTO post_topics (post_id, topic_id) VALUES ${sql.raw(values)} ON CONFLICT DO NOTHING`
  }

  const { rows: topicsRows } = await sql`
    SELECT t.id, t.name, t.description FROM post_topics pt
    JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${post.id}`

  return created({
    id: post.id, content: post.content, author_id: post.author_id,
    created_at: post.created_at, updated_at: post.updated_at,
    likes_count: post.likes_count, comments_count: post.comments_count,
    topics: topicsRows,
    author: { id: user.id, username: user.username, email: user.email,
      date_of_birth: user.date_of_birth, is_admin: user.is_admin, created_at: user.created_at },
  })
}

// ─── PUT /api/v1/posts/{id} ───────────────────────────────────────────────────
async function PUT_update_post(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const { rows: existing } = await sql`SELECT * FROM posts WHERE id = ${postId}`
  if (!existing[0]) return err(404, 'Post not found')
  if (existing[0].author_id !== user.id) return err(403, 'You are not authorized to update this post')

  const body = await request.json()
  const { content, topic_ids } = body

  if (content !== undefined && (typeof content !== 'string' || content.trim().length > 5000)) {
    return err(400, 'Content must not exceed 5000 characters')
  }

  const { rows } = await sql`
    UPDATE posts SET
      content = COALESCE(${content}, content),
      updated_at = NOW()
    WHERE id = ${postId}
    RETURNING *`
  const post = rows[0]

  if (topic_ids !== undefined) {
    await sql`DELETE FROM post_topics WHERE post_id = ${postId}`
    if (topic_ids.length) {
      const values = topic_ids.map(tid => `(${postId}, ${tid})`).join(',')
      await sql`INSERT INTO post_topics (post_id, topic_id) VALUES ${sql.raw(values)}`
    }
  }

  const { rows: topicsRows } = await sql`
    SELECT t.id, t.name, t.description FROM post_topics pt
    JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${postId}`

  return ok({
    id: post.id, content: post.content, author_id: post.author_id,
    created_at: post.created_at, updated_at: post.updated_at,
    likes_count: post.likes_count, comments_count: post.comments_count,
    topics: topicsRows,
    author: { id: user.id, username: user.username, email: user.email,
      date_of_birth: user.date_of_birth, is_admin: user.is_admin, created_at: user.created_at },
  })
}

// ─── DELETE /api/v1/posts/{id} ────────────────────────────────────────────────
async function DELETE_delete_post(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const { rows: existing } = await sql`SELECT * FROM posts WHERE id = ${postId}`
  if (!existing[0]) return err(404, 'Post not found')
  if (existing[0].author_id !== user.id) return err(403, 'You are not authorized to delete this post')

  await sql`DELETE FROM posts WHERE id = ${postId}`
  return noContent()
}

// ─── GET /api/v1/posts/{id} ───────────────────────────────────────────────────
async function GET_post(request, id) {
  await getUserFromToken(request) // verify auth

  const { rows } = await sql`
    SELECT p.*,
      u.id as "author.id", u.username as "author.username", u.email as "author.email",
      u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
    FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ${id}`
  if (!rows[0]) return err(404, 'Post not found')

  const p = rows[0]
  const { rows: topicsRows } = await sql`SELECT t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${id}`

  return ok({
    id: p.id, content: p.content, author_id: p.author_id, created_at: p.created_at, updated_at: p.updated_at,
    likes_count: p.likes_count, comments_count: p.comments_count, topics: topicsRows,
    author: { id: p['author.id'], username: p['author.username'], email: p['author.email'],
      date_of_birth: p['author.date_of_birth'], is_admin: p['author.is_admin'], created_at: p['author.created_at'] },
  })
}

// ─── GET /api/v1/posts/{id}/comments/ ────────────────────────────────────────
async function GET_comments(request, postId) {
  await getUserFromToken(request)

  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  let query
  if (cursor) {
    query = sql`
      SELECT c.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.avatar_url as "author.avatar_url", u.created_at as "author.created_at"
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ${postId} AND c.id < ${parseInt(cursor, 10)}
      ORDER BY c.id ASC LIMIT ${limit + 1}`
  } else {
    query = sql`
      SELECT c.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.avatar_url as "author.avatar_url", u.created_at as "author.created_at"
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ${postId}
      ORDER BY c.id ASC LIMIT ${limit + 1}`
  }

  const { rows } = await query
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map(c => ({
    id: c.id, content: c.content, post_id: c.post_id, author_id: c.author_id,
    parent_id: c.parent_id, created_at: c.created_at,
    author: {
      id: c['author.id'], username: c['author.username'], email: c['author.email'],
      avatar_url: c['author.avatar_url'], created_at: c['author.created_at'],
    },
  }))
  const next_cursor = hasMore && items.length > 0 ? items[items.length - 1].id : null
  return ok({ comments: items, next_cursor })
}

// ─── POST /api/v1/posts/{id}/comments/ ────────────────────────────────────────
async function POST_create_comment(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const { rows: post } = await sql`SELECT id, author_id FROM posts WHERE id = ${postId}`
  if (!post[0]) return err(404, 'Post not found')

  const body = await request.json()
  const { content, parent_id } = body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return err(400, 'Comment content is required')
  }
  if (content.trim().length > 1000) {
    return err(400, 'Comment must not exceed 1000 characters')
  }

  const { rows } = await sql`
    INSERT INTO comments (content, post_id, author_id, parent_id)
    VALUES (${content}, ${postId}, ${user.id}, ${parent_id || null})
    RETURNING *`

  await sql`UPDATE posts SET comments_count = comments_count + 1 WHERE id = ${postId}`

  if (post[0].author_id !== user.id) {
    await createNotification(post[0].author_id, 'comment', {
      actor_id: user.id, actor_username: user.username, post_id: Number(postId)
    }, user.avatar_url)
  }

  const comment = rows[0]
  return created({
    id: comment.id, content: comment.content, post_id: comment.post_id,
    author_id: comment.author_id, parent_id: comment.parent_id, created_at: comment.created_at,
    author: { id: user.id, username: user.username, email: user.email, created_at: user.created_at },
  })
}

// ─── POST /api/v1/likes/posts/{id}/like/ ──────────────────────────────────────
async function POST_like(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const { rows: post } = await sql`SELECT id, author_id FROM posts WHERE id = ${postId}`
  if (!post[0]) return err(404, 'Post not found')

  try {
    await sql`INSERT INTO likes (user_id, post_id) VALUES (${user.id}, ${postId})`
    await sql`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}`
    if (post[0].author_id !== user.id) {
      await createNotification(post[0].author_id, 'like', {
        actor_id: user.id, actor_username: user.username, post_id: Number(postId)
      }, user.avatar_url)
    }
    return created({ liked: true })
  } catch (e) {
    if (e.code === '23505') return err(400, 'Already liked')
    throw e
  }
}

// ─── DELETE /api/v1/likes/posts/{id}/like/ ────────────────────────────────────
async function DELETE_unlike(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const result = await sql`DELETE FROM likes WHERE user_id = ${user.id} AND post_id = ${postId} RETURNING *`
  if (!result.rowCount) return err(404, 'Like not found')
  await sql`UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}`
  return ok({ liked: false })
}

// ─── POST /api/v1/follows/users/{id}/follow/ ─────────────────────────────────
async function POST_follow(request, userId) {
  const me = await getUserFromToken(request)
  if (!me) return err(401, 'Could not validate credentials')
  if (me.id === Number(userId)) return err(400, 'Cannot follow yourself')

  const { rows: target } = await sql`SELECT id FROM users WHERE id = ${userId}`
  if (!target[0]) return err(404, 'User not found')

  try {
    await sql`INSERT INTO follows (follower_id, following_id) VALUES (${me.id}, ${userId})`
    await createNotification(userId, 'follow', {
      actor_id: me.id, actor_username: me.username
    }, me.avatar_url)
    return created({ following: true })
  } catch (e) {
    if (e.code === '23505') return err(400, 'Already following')
    throw e
  }
}

// ─── DELETE /api/v1/follows/users/{id}/follow/ ────────────────────────────────
async function DELETE_unfollow(request, userId) {
  const me = await getUserFromToken(request)
  if (!me) return err(401, 'Could not validate credentials')

  const result = await sql`DELETE FROM follows WHERE follower_id = ${me.id} AND following_id = ${userId} RETURNING *`
  if (!result.rowCount) return err(404, 'Not following')
  return ok({ following: false })
}

// ─── GET /api/v1/follows/users/{id}/followers/ ────────────────────────────────
async function GET_followers(request, userId) {
  await getUserFromToken(request)
  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  let { rows } = await sql`
    SELECT u.id, u.username, u.email, u.created_at FROM follows f
    JOIN users u ON u.id = f.follower_id WHERE f.following_id = ${userId}
    ORDER BY f.created_at DESC
    LIMIT ${limit + 1}`

  let hasMore = false
  if (cursor) {
    const cursorIdx = rows.findIndex(r => String(r.id) === cursor)
    if (cursorIdx >= 0) {
      rows = rows.slice(cursorIdx + 1)
      hasMore = rows.length > limit
      rows = rows.slice(0, limit)
    } else {
      rows = []
    }
  } else {
    hasMore = rows.length > limit
    rows = rows.slice(0, limit)
  }

  const next_cursor = hasMore && rows.length > 0 ? String(rows[rows.length - 1].id) : null
  return ok({ items: rows, next_cursor })
}

// ─── GET /api/v1/follows/users/{id}/following/ ────────────────────────────────
async function GET_following(request, userId) {
  await getUserFromToken(request)
  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  let { rows } = await sql`
    SELECT u.id, u.username, u.email, u.created_at FROM follows f
    JOIN users u ON u.id = f.following_id WHERE f.follower_id = ${userId}
    ORDER BY f.created_at DESC
    LIMIT ${limit + 1}`

  let hasMore = false
  if (cursor) {
    const cursorIdx = rows.findIndex(r => String(r.id) === cursor)
    if (cursorIdx >= 0) {
      rows = rows.slice(cursorIdx + 1)
      hasMore = rows.length > limit
      rows = rows.slice(0, limit)
    } else {
      rows = []
    }
  } else {
    hasMore = rows.length > limit
    rows = rows.slice(0, limit)
  }

  const next_cursor = hasMore && rows.length > 0 ? String(rows[rows.length - 1].id) : null
  return ok({ items: rows, next_cursor })
}

// ─── GET /api/v1/follows/users/{id}/status/ ──────────────────────────────────
async function GET_follow_status(request, userId) {
  const me = await getUserFromToken(request)
  if (!me) return err(401, 'Could not validate credentials')
  const { rows } = await sql`SELECT 1 FROM follows WHERE follower_id = ${me.id} AND following_id = ${userId} LIMIT 1`
  return ok({ following: rows.length > 0 })
}

// ─── GET /api/v1/topics/ ───────────────────────────────────────────────────────
async function GET_topics() {
  const { rows } = await sql`SELECT * FROM topics ORDER BY id`
  return ok(rows)
}

// ─── GET /api/v1/preferences/users/me/preferences ─────────────────────────────
async function GET_preferences(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const { rows } = await sql`SELECT topic_ids FROM user_preferences WHERE user_id = ${user.id}`
  const topicIds = rows[0]?.topic_ids || []

  const { rows: topicRows } = await sql`SELECT * FROM topics WHERE id = ANY(${topicIds})`
  return ok({ topics: topicRows })
}

// ─── PUT /api/v1/preferences/users/me/preferences ─────────────────────────────
async function PUT_update_preferences(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const body = await request.json()
  const { topic_ids } = body
  if (!Array.isArray(topic_ids)) return err(400, 'topic_ids must be an array')

  await sql`
    INSERT INTO user_preferences (user_id, topic_ids, updated_at)
    VALUES (${user.id}, ${topic_ids}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET topic_ids = ${topic_ids}, updated_at = NOW()`

  const { rows: topicRows } = await sql`SELECT * FROM topics WHERE id = ANY(${topic_ids})`
  return ok({ topics: topicRows })
}

// ─── POST /api/v1/users/me/change-password ───────────────────────────────────
async function POST_change_password(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const body = await request.json()
  const { current_password, new_password } = body
  if (!current_password || !new_password) return err(400, 'current_password and new_password are required')

  const valid = await bcrypt.compare(current_password, user.hashed_password)
  if (!valid) return err(400, 'Current password is incorrect')

  const hashed = await bcrypt.hash(new_password, 10)
  await sql`UPDATE users SET hashed_password = ${hashed} WHERE id = ${user.id}`
  return ok({ success: true })
}

// ─── GET /api/v1/health ───────────────────────────────────────────────────────
async function GET_health() {
  return ok({ status: 'ok' })
}

// ─── GET /api/v1/likes/posts/{id}/status/ ───────────────────────────────────
async function GET_like_status(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  const { rows } = await sql`SELECT 1 FROM likes WHERE user_id = ${user.id} AND post_id = ${postId} LIMIT 1`
  return ok({ liked: rows.length > 0 })
}

// ─── GET /api/v1/notifications/ ───────────────────────────────────────────────
async function GET_notifications(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  let query
  if (cursor) {
    query = sql`
      SELECT id, user_id, type, data, actor_avatar_url, is_read, created_at
      FROM notifications WHERE user_id = ${user.id} AND id < ${parseInt(cursor, 10)}
      ORDER BY created_at DESC LIMIT ${limit + 1}`
  } else {
    query = sql`
      SELECT id, user_id, type, data, actor_avatar_url, is_read, created_at
      FROM notifications WHERE user_id = ${user.id}
      ORDER BY created_at DESC LIMIT ${limit + 1}`
  }
  const { rows } = await query
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)

  const next_cursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : null
  return ok({ notifications: items, next_cursor })
}

// ─── GET /api/v1/notifications/unread-count ───────────────────────────────────
async function GET_notifications_unread(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  const [{ count }] = await sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${user.id} AND is_read = FALSE`
  return ok({ count: parseInt(count) })
}

// ─── PUT /api/v1/notifications/{id}/read ─────────────────────────────────────
async function PUT_notification_read(request, notifId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${notifId} AND user_id = ${user.id}`
  return noContent()
}

// ─── PUT /api/v1/notifications/read-all ─────────────────────────────────────
async function PUT_notifications_read_all(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${user.id}`
  return noContent()
}

// ─── GET /api/v1/bookmarks/ ───────────────────────────────────────────────────
async function GET_bookmarks(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  let query
  if (cursor) {
    query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id
      JOIN users u ON u.id = p.author_id
      WHERE b.user_id = ${user.id} AND b.created_at < ${cursor}
      ORDER BY b.created_at DESC LIMIT ${limit + 1}`
  } else {
    query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id
      JOIN users u ON u.id = p.author_id
      WHERE b.user_id = ${user.id}
      ORDER BY b.created_at DESC LIMIT ${limit + 1}`
  }
  const { rows } = await query
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)

  const { rows: postTopics } = await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`
  const topicsMap = {}
  for (const pt of postTopics) {
    if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = []
    topicsMap[pt.post_id].push({ id: pt.id, name: pt.name, description: pt.description })
  }

  const posts = items.map(p => ({
    id: p.id, content: p.content, author_id: p.author_id, created_at: p.created_at, updated_at: p.updated_at,
    likes_count: p.likes_count, comments_count: p.comments_count,
    topics: topicsMap[p.id] || [],
    author: { id: p['author.id'], username: p['author.username'], email: p['author.email'],
      date_of_birth: p['author.date_of_birth'], is_admin: p['author.is_admin'], created_at: p['author.created_at'] },
  }))

  const next_cursor = hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null
  return ok({ posts, next_cursor })
}

// ─── POST /api/v1/bookmarks/posts/{id}/ ──────────────────────────────────────
async function POST_bookmark(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  const { rows: post } = await sql`SELECT id FROM posts WHERE id = ${postId}`
  if (!post[0]) return err(404, 'Post not found')
  try {
    await sql`INSERT INTO bookmarks (user_id, post_id) VALUES (${user.id}, ${postId})`
    return created({ bookmarked: true })
  } catch (e) {
    if (e.code === '23505') return err(400, 'Already bookmarked')
    throw e
  }
}

// ─── DELETE /api/v1/bookmarks/posts/{id}/ ────────────────────────────────────
async function DELETE_unbookmark(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  const result = await sql`DELETE FROM bookmarks WHERE user_id = ${user.id} AND post_id = ${postId} RETURNING *`
  if (!result.rowCount) return err(404, 'Bookmark not found')
  return noContent()
}

// ─── Main GET Handler ──────────────────────────────────────────────────────────
export async function GET(request) {
  await initDb()

  const url = new URL(request.url)
  const path = url.pathname

  try {
    if (path === '/health' || path === '/api/v1/health') return GET_health()
    if (path === '/api/v1/topics/') return GET_topics()
    if (path === '/api/v1/posts/feed') return GET_feed(request)
    if (path === '/api/v1/posts/explore') return GET_explore(request)
    if (path === '/api/v1/posts/search') return GET_search_posts(request)

    const commentsMatch = path.match(/^\/api\/v1\/posts\/(\d+)\/comments\/$/)
    if (commentsMatch && request.method === 'GET') return GET_comments(request, commentsMatch[1])

    const postIdMatch = path.match(/^\/api\/v1\/posts\/(\d+)$/)
    if (postIdMatch && request.method === 'GET') return GET_post(request, postIdMatch[1])

    if (path === '/api/v1/users/me') return GET_users_me(request)

    const searchMatch = path.match(/^\/api\/v1\/users\/search$/)
    if (searchMatch) return GET_search_users(request)

    const userProfileMatch = path.match(/^\/api\/v1\/users\/(\d+)\/profile$/)
    if (userProfileMatch) return GET_user_profile(request, userProfileMatch[1])

    const userPostsMatch = path.match(/^\/api\/v1\/users\/(\d+)\/posts\/$/)
    if (userPostsMatch) return GET_user_posts(request, userPostsMatch[1])

    const userMatch = path.match(/^\/api\/v1\/users\/(\d+)$/)
    if (userMatch) return GET_user_by_id(request, userMatch[1])

    const followersMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/followers\/$/)
    if (followersMatch) return GET_followers(request, followersMatch[1])

    const followingMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/following\/$/)
    if (followingMatch) return GET_following(request, followingMatch[1])

    const followStatusMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/status\/$/)
    if (followStatusMatch) return GET_follow_status(request, followStatusMatch[1])

    if (path === '/api/v1/preferences/users/me/preferences') return GET_preferences(request)

    const likeStatusMatch = path.match(/^\/api\/v1\/likes\/posts\/(\d+)\/status\/$/)
    if (likeStatusMatch) return GET_like_status(request, likeStatusMatch[1])

    if (path === '/api/v1/notifications/') return GET_notifications(request)
    if (path === '/api/v1/notifications/unread-count') return GET_notifications_unread(request)
    if (path === '/api/v1/bookmarks/') return GET_bookmarks(request)

    return err(404, 'Not Found')
  } catch (e) {
    console.error(e)
    return err(500, 'Internal server error')
  }
}

// ─── Main POST Handler ─────────────────────────────────────────────────────────
export async function POST(request) {
  await initDb()

  const url = new URL(request.url)
  const path = url.pathname

  try {
    if (path === '/api/v1/auth/login') return POST_auth_login(request)
    if (path === '/api/v1/auth/register') return POST_auth_register(request)
    if (path === '/api/v1/posts/' ) return POST_create_post(request)

    const commentsMatch = path.match(/^\/api\/v1\/posts\/(\d+)\/comments\/$/)
    if (commentsMatch) return POST_create_comment(request, commentsMatch[1])

    if (path === '/api/v1/users/me/change-password') return POST_change_password(request)

    const likeMatch = path.match(/^\/api\/v1\/likes\/posts\/(\d+)\/like\/$/)
    if (likeMatch) return POST_like(request, likeMatch[1])

    const followMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/follow\/$/)
    if (followMatch) return POST_follow(request, followMatch[1])

    const bookmarkMatch = path.match(/^\/api\/v1\/bookmarks\/posts\/(\d+)\/$/)
    if (bookmarkMatch) return POST_bookmark(request, bookmarkMatch[1])

    return err(404, 'Not Found')
  } catch (e) {
    console.error(e)
    return err(500, 'Internal server error')
  }
}

// ─── Main PUT Handler ───────────────────────────────────────────────────────────
export async function PUT(request) {
  await initDb()

  const url = new URL(request.url)
  const path = url.pathname

  try {
    const postMatch = path.match(/^\/api\/v1\/posts\/(\d+)$/)
    if (postMatch) return PUT_update_post(request, postMatch[1])

    if (path === '/api/v1/users/me') return PUT_update_me(request)
    if (path === '/api/v1/preferences/users/me/preferences') return PUT_update_preferences(request)

    const notifReadMatch = path.match(/^\/api\/v1\/notifications\/(\d+)\/read$/)
    if (notifReadMatch) return PUT_notification_read(request, notifReadMatch[1])

    if (path === '/api/v1/notifications/read-all') return PUT_notifications_read_all(request)

    return err(405, 'Method Not Allowed')
  } catch (e) {
    console.error(e)
    return err(500, 'Internal server error')
  }
}

// ─── Main DELETE Handler ─────────────────────────────────────────────────────────
export async function DELETE(request) {
  await initDb()

  const url = new URL(request.url)
  const path = url.pathname

  try {
    const postMatch = path.match(/^\/api\/v1\/posts\/(\d+)$/)
    if (postMatch) return DELETE_delete_post(request, postMatch[1])

    const likeMatch = path.match(/^\/api\/v1\/likes\/posts\/(\d+)\/like\/$/)
    if (likeMatch) return DELETE_unlike(request, likeMatch[1])

    const followMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/follow\/$/)
    if (followMatch) return DELETE_unfollow(request, followMatch[1])

    if (path === '/api/v1/users/me') return DELETE_delete_me(request)

    const bookmarkMatch = path.match(/^\/api\/v1\/bookmarks\/posts\/(\d+)\/$/)
    if (bookmarkMatch) return DELETE_unbookmark(request, bookmarkMatch[1])

    return err(405, 'Method Not Allowed')
  } catch (e) {
    console.error(e)
    return err(500, 'Internal server error')
  }
}
