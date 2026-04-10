import { sql } from '@vercel/postgres'
import { NextResponse } from 'next/server'

// In-memory data stores (Vercel Serverless)
const users = new Map()
const posts = new Map()
const comments = new Map()
const likes = new Map() // key: "userId:postId", value: {createdAt}
const follows = new Map() // key: "followerId:followingId"
const topics = [
  { id: 1, name: 'Thể thao', description: 'Các bài viết về thể thao' },
  { id: 2, name: 'Công nghệ', description: 'Công nghệ, lập trình, AI' },
  { id: 3, name: 'Game', description: 'Tin tức và thảo luận về game' },
  { id: 4, name: 'Ẩm thực', description: 'Nấu ăn, đặc sản' },
  { id: 5, name: 'Du lịch', description: 'Điểm đến, kinh nghiệm du lịch' },
  { id: 6, name: 'Âm nhạc', description: 'Nhạc Việt, nhạc quốc tế' },
  { id: 7, name: 'Phim ảnh', description: 'Review phim, tin tức điện ảnh' },
  { id: 8, name: 'Sách', description: 'Sách hay, review sách' },
  { id: 9, name: 'Kinh doanh', description: 'Khởi nghiệp, đầu tư' },
  { id: 10, name: 'Giáo dục', description: 'Học tập, tuyển sinh' },
]
let nextUserId = 1
let nextPostId = 1
let nextCommentId = 1

// Convert Map to array for SQL queries
function getUsers() { return [...users.values()] }
function getPosts() { return [...posts.values()] }

// ─── Auth Helpers ────────────────────────────────────────────────
async function getUserFromToken(request) {
  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const { verifyToken } = await import('./jwt.js')
  const payload = verifyToken(auth.slice(7))
  if (!payload) return null
  return users.get(payload.sub)
}

// ─── Response helpers ──────────────────────────────────────────────
function ok(data) { return NextResponse.json(data) }
function created(data) { return NextResponse.json(data, { status: 201 }) }
function err(status, msg) { return NextResponse.json({ detail: msg }, { status }) }

// ─── GET /api/v1/auth/login ──────────────────────────────────────
async function POST_auth_login(request) {
  const body = await request.json()
  const { username, password } = body

  const user = [...users.values()].find(u => u.username === username)
  if (!user) return err(401, 'Incorrect username or password')

  const { verifyPassword } = await import('./bcrypt.js')
  const valid = await verifyPassword(password, user.hashed_password)
  if (!valid) return err(401, 'Incorrect username or password')

  const { signToken } = await import('./jwt.js')
  const token = signToken(user.id)

  return ok({ access_token: token, token_type: 'bearer' })
}

// ─── POST /api/v1/auth/register ─────────────────────────────────
async function POST_auth_register(request) {
  const body = await request.json()
  const { username, email, password, date_of_birth } = body

  if ([...users.values()].some(u => u.username === username))
    return err(400, 'Username already registered')
  if ([...users.values()].some(u => u.email === email))
    return err(400, 'Email already registered')

  const { hashPassword } = await import('./bcrypt.js')
  const hashed = await hashPassword(password)

  const user = {
    id: nextUserId++,
    username,
    email,
    hashed_password: hashed,
    date_of_birth: date_of_birth || null,
    is_admin: false,
    created_at: new Date().toISOString(),
  }
  users.set(user.id, user)

  return created({
    id: user.id,
    username: user.username,
    email: user.email,
    date_of_birth: user.date_of_birth,
    is_admin: user.is_admin,
    created_at: user.created_at,
  })
}

// ─── GET /api/v1/users/me ───────────────────────────────────────
async function GET_users_me(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    date_of_birth: user.date_of_birth,
    is_admin: user.is_admin,
    created_at: user.created_at,
  })
}

// ─── GET /api/v1/users/{id} ─────────────────────────────────────
async function GET_user_by_id(request, id) {
  const user = users.get(id)
  if (!user) return err(404, 'User not found')
  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    date_of_birth: user.date_of_birth,
    is_admin: user.is_admin,
    created_at: user.created_at,
  })
}

// ─── GET /api/v1/users/{id}/profile ─────────────────────────────
async function GET_user_profile(request, id) {
  const user = users.get(id)
  if (!user) return err(404, 'User not found')

  const followers_count = [...follows.values()].filter(f => f.following_id === id).length
  const following_count = [...follows.values()].filter(f => f.follower_id === id).length
  const posts_count = [...posts.values()].filter(p => p.author_id === id).length

  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    date_of_birth: user.date_of_birth,
    is_admin: user.is_admin,
    created_at: user.created_at,
    followers_count,
    following_count,
    posts_count,
  })
}

// ─── POST /api/v1/posts/ ─────────────────────────────────────────
async function POST_create_post(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const body = await request.json()
  const post = {
    id: nextPostId++,
    content: body.content,
    author_id: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    topics: (body.topic_ids || []).map(id => topics.find(t => t.id === id)).filter(Boolean),
    author: {
      id: user.id,
      username: user.username,
      email: user.email,
      date_of_birth: user.date_of_birth,
      is_admin: user.is_admin,
      created_at: user.created_at,
    },
    likes_count: 0,
    comments_count: 0,
  }
  posts.set(post.id, post)
  return created(post)
}

// ─── GET /api/v1/posts/feed ──────────────────────────────────────
async function GET_feed(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  // Get user's preferences
  const preferredTopics = [...posts.values()]
    .filter(p => p.topics?.some(t => true)) // simplified
    .map(p => p.topics.map(t => t.id))
    .flat()

  // Get user's follows
  const followingIds = [...follows.values()]
    .filter(f => f.follower_id === user.id)
    .map(f => f.following_id)

  const allPosts = [...posts.values()]

  // Score posts
  const scored = allPosts.map(post => {
    let score = 0
    if (followingIds.includes(post.author_id)) score += 1
    if (post.topics?.length > 0) score += 2
    return { ...post, feed_score: score }
  })

  scored.sort((a, b) => b.feed_score - a.feed_score || new Date(b.created_at) - new Date(a.created_at))

  return ok(scored)
}

// ─── GET /api/v1/posts/{id} ──────────────────────────────────────
async function GET_post(request, id) {
  const post = posts.get(Number(id))
  if (!post) return err(404, 'Post not found')
  return ok(post)
}

// ─── POST /api/v1/likes/posts/{id}/like/ ──────────────────────────
async function POST_like(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const post = posts.get(Number(postId))
  if (!post) return err(404, 'Post not found')

  const key = `${user.id}:${postId}`
  if (likes.has(key)) return err(400, 'Already liked')

  likes.set(key, { user_id: user.id, post_id: Number(postId), created_at: new Date().toISOString() })
  post.likes_count = (post.likes_count || 0) + 1

  return created({ liked: true })
}

// ─── DELETE /api/v1/likes/posts/{id}/like/ ───────────────────────
async function DELETE_unlike(request, postId) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')

  const key = `${user.id}:${postId}`
  if (!likes.has(key)) return err(404, 'Like not found')

  likes.delete(key)
  const post = posts.get(Number(postId))
  if (post) post.likes_count = Math.max(0, (post.likes_count || 0) - 1)

  return ok({ liked: false })
}

// ─── POST /api/v1/follows/users/{id}/follow/ ─────────────────────
async function POST_follow(request, userId) {
  const me = await getUserFromToken(request)
  if (!me) return err(401, 'Could not validate credentials')
  if (me.id === Number(userId)) return err(400, 'Cannot follow yourself')

  const target = users.get(Number(userId))
  if (!target) return err(404, 'User not found')

  const key = `${me.id}:${userId}`
  if (follows.has(key)) return err(400, 'Already following')

  follows.set(key, { follower_id: me.id, following_id: Number(userId), created_at: new Date().toISOString() })
  return created({ following: true })
}

// ─── DELETE /api/v1/follows/users/{id}/follow/ ───────────────────
async function DELETE_unfollow(request, userId) {
  const me = await getUserFromToken(request)
  if (!me) return err(401, 'Could not validate credentials')

  const key = `${me.id}:${userId}`
  if (!follows.has(key)) return err(404, 'Not following')

  follows.delete(key)
  return ok({ following: false })
}

// ─── GET /api/v1/topics/ ──────────────────────────────────────────
async function GET_topics() {
  return ok(topics)
}

// ─── GET /api/v1/preferences/users/me/preferences ────────────────
async function GET_preferences(request) {
  const user = await getUserFromToken(request)
  if (!user) return err(401, 'Could not validate credentials')
  return ok({ topics: [] }) // simplified
}

// ─── GET /api/v1/health ────────────────────────────────────────────
async function GET_health() {
  return ok({ status: 'ok' })
}

// ─── Main Request Handler ──────────────────────────────────────────
export async function GET(request) {
  const url = new URL(request.url)
  const path = url.pathname

  try {
    // Health
    if (path === '/health' || path === '/api/v1/health') return GET_health()

    // Topics
    if (path === '/api/v1/topics/') return GET_topics()

    // /api/v1/posts/feed
    if (path === '/api/v1/posts/feed' && request.method === 'GET') return GET_feed(request)

    // /api/v1/posts/{id}
    const postIdMatch = path.match(/^\/api\/v1\/posts\/(\d+)$/)
    if (postIdMatch && request.method === 'GET') return GET_post(request, postIdMatch[1])

    // /api/v1/users/me
    if (path === '/api/v1/users/me' && request.method === 'GET') return GET_users_me(request)

    // /api/v1/users/{id}
    const userIdMatch = path.match(/^\/api\/v1\/users\/(\d+)\/profile$/)
    if (userIdMatch) return GET_user_profile(request, userIdMatch[1])

    // /api/v1/users/{id}
    const userMatch = path.match(/^\/api\/v1\/users\/(\d+)$/)
    if (userMatch) return GET_user_by_id(request, userMatch[1])

    // /api/v1/preferences/users/me/preferences
    if (path === '/api/v1/preferences/users/me/preferences') return GET_preferences(request)

    // /api/v1/likes/posts/{id}/like/
    const likeMatch = path.match(/^\/api\/v1\/likes\/posts\/(\d+)\/like\/$/)
    if (likeMatch && request.method === 'POST') return POST_like(request, likeMatch[1])
    if (likeMatch && request.method === 'DELETE') return DELETE_unlike(request, likeMatch[1])

    // /api/v1/follows/users/{id}/follow/
    const followMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/follow\/$/)
    if (followMatch && request.method === 'POST') return POST_follow(request, followMatch[1])
    if (followMatch && request.method === 'DELETE') return DELETE_unfollow(request, followMatch[1])

    // Fallback: not found
    return err(404, 'Not Found')
  } catch (e) {
    console.error(e)
    return err(500, 'Internal server error')
  }
}

export async function POST(request) {
  const url = new URL(request.url)
  const path = url.pathname

  try {
    // Auth
    if (path === '/api/v1/auth/login') return POST_auth_login(request)
    if (path === '/api/v1/auth/register') return POST_auth_register(request)

    // Posts
    if (path === '/api/v1/posts/' && request.method === 'POST') return POST_create_post(request)

    // Likes
    const likeMatch = path.match(/^\/api\/v1\/likes\/posts\/(\d+)\/like\/$/)
    if (likeMatch) return POST_like(request, likeMatch[1])

    // Follows
    const followMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/follow\/$/)
    if (followMatch) return POST_follow(request, followMatch[1])

    return err(404, 'Not Found')
  } catch (e) {
    console.error(e)
    return err(500, 'Internal server error')
  }
}

export async function DELETE(request) {
  const url = new URL(request.url)
  const path = url.pathname

  const likeMatch = path.match(/^\/api\/v1\/likes\/posts\/(\d+)\/like\/$/)
  if (likeMatch) return DELETE_unlike(request, likeMatch[1])

  const followMatch = path.match(/^\/api\/v1\/follows\/users\/(\d+)\/follow\/$/)
  if (followMatch) return DELETE_unfollow(request, followMatch[1])

  return err(404, 'Not Found')
}