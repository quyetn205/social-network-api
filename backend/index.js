import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb, sql, sqlUnsafe } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.SECRET_KEY || 'fallback-secret';
const ALGORITHM = process.env.ALGORITHM || 'HS256';
const EXPIRE_MINUTES = parseInt(
    process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '15',
    10
);

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
function signToken(userId, type = 'access') {
    const expiresIn = type === 'refresh' ? '7d' : `${EXPIRE_MINUTES}m`;
    return jwt.sign({ sub: userId, type }, SECRET, {
        algorithm: ALGORITHM,
        expiresIn
    });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });
    } catch {
        return null;
    }
}

async function getUserFromToken(req) {
    const auth = req.headers.authorization;
    const tokenFromQuery = req.query?.access_token;
    const token =
        auth && auth.startsWith('Bearer ') ? auth.slice(7) : tokenFromQuery;
    if (!token) return null;
    const payload = verifyToken(token);
    if (!payload) return null;
    const { rows } = await sql`SELECT * FROM users WHERE id = ${payload.sub}`;
    return rows[0] || null;
}

// ─── Notification Helper ──────────────────────────────────────────────────────
const notificationClients = new Map();

function writeSseEvent(res, event, data) {
    if (event) res.write(`event: ${event}\n`);
    if (data !== undefined) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        for (const line of payload.split('\n')) {
            res.write(`data: ${line}\n`);
        }
    }
    res.write('\n');
}

function broadcastNotification(userId, notification) {
    const clients = notificationClients.get(Number(userId));
    if (!clients || clients.size === 0) return;

    for (const client of clients) {
        writeSseEvent(client, 'notification', { notification });
    }
}

async function createNotification(userId, type, data, actorAvatarUrl) {
    const { rows } = await sql`
      INSERT INTO notifications (user_id, type, data, actor_avatar_url)
      VALUES (${userId}, ${type}, ${JSON.stringify(data)}, ${actorAvatarUrl || null})
      RETURNING id, user_id, type, data, actor_avatar_url, is_read, created_at`;
    const notification = rows[0];
    if (notification) broadcastNotification(userId, notification);
    return notification;
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────
const rateLimits = new Map();
const loginLimits = new Map();
function checkRateLimit(ip, max = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const record = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + windowMs;
    }
    record.count++;
    rateLimits.set(ip, record);
    if (record.count > max)
        return {
            limited: true,
            retryAfter: Math.ceil((record.resetAt - now) / 1000)
        };
    return { limited: false };
}
function checkLoginLimit(ip) {
    const now = Date.now();
    const record = loginLimits.get(ip) || {
        count: 0,
        resetAt: now + 15 * 60 * 1000
    };
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + 15 * 60 * 1000;
    }
    record.count++;
    loginLimits.set(ip, record);
    if (record.count > 10)
        return {
            limited: true,
            retryAfter: Math.ceil((record.resetAt - now) / 1000)
        };
    return { limited: false };
}

// ─── Response helpers ─────────────────────────────────────────────────────────
function ok(res, data) {
    res.json(data);
}
function created(res, data) {
    res.status(201).json(data);
}
function noContent(res) {
    res.sendStatus(204);
}
function err(res, status, msg) {
    res.status(status).json({ detail: msg });
}
function rateLimitResponse(res, retryAfter) {
    res.status(429)
        .set('Retry-After', String(retryAfter))
        .json({ detail: 'Too many requests. Please try again later.' });
}

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
async function POST_auth_register(req, res) {
    const body = req.body;
    const { username, email, password, date_of_birth } = body;

    if (!username || !email || !password) {
        return err(res, 400, 'username, email, and password are required');
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
        return err(
            res,
            400,
            'Username must be 4–20 characters: letters, numbers, and underscore only'
        );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return err(res, 400, 'Invalid email format');
    }
    if (password.length < 8) {
        return err(res, 400, 'Password must be at least 8 characters');
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        const { rows } = await sql`
      INSERT INTO users (username, email, hashed_password, date_of_birth)
      VALUES (${username}, ${email}, ${hashed}, ${date_of_birth || null})
      RETURNING id, username, email, date_of_birth, is_admin, created_at`;
        return created(res, rows[0]);
    } catch (e) {
        if (e.code === '23505') {
            const field = e.constraint?.includes('username')
                ? 'Username'
                : 'Email';
            return err(res, 400, `${field} already registered`);
        }
        return err(res, 500, 'Registration failed');
    }
}

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
async function POST_auth_login(req, res) {
    const ip =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        'unknown';

    const limited = checkLoginLimit(ip);
    if (limited.limited) return rateLimitResponse(res, limited.retryAfter);

    const body = req.body;
    const { username, password } = body;

    const { rows } =
        await sql`SELECT * FROM users WHERE username = ${username} OR email = ${username}`;
    const user = rows[0];
    if (!user) return err(res, 401, 'Incorrect username or password');

    const valid = await bcrypt.compare(password, user.hashed_password);
    if (!valid) return err(res, 401, 'Incorrect username or password');

    const access_token = signToken(user.id, 'access');
    const refresh_token = signToken(user.id, 'refresh');

    const tokenHash = await bcrypt.hash(refresh_token, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await sql`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (${user.id}, ${tokenHash}, ${expiresAt})`;

    return ok(res, {
        access_token,
        refresh_token,
        token_type: 'bearer',
        expires_in: 900
    });
}

// ─── POST /api/v1/auth/refresh ───────────────────────────────────────────────
async function POST_auth_refresh(req, res) {
    const body = req.body;
    const { refresh_token } = body;
    if (!refresh_token) return err(res, 400, 'refresh_token is required');

    try {
        const payload = verifyToken(refresh_token);
        if (!payload || payload.type !== 'refresh')
            return err(res, 401, 'Invalid refresh token');
        const userId = payload.sub;

        const { rows: userRows } =
            await sql`SELECT * FROM users WHERE id = ${userId}`;
        if (!userRows[0]) return err(res, 401, 'User not found');

        const newAccessToken = signToken(userId, 'access');
        const newRefreshToken = signToken(userId, 'refresh');

        const tokenHash = await bcrypt.hash(newRefreshToken, 10);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sql`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash}, ${expiresAt})`;

        return ok(res, {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_type: 'bearer',
            expires_in: 900
        });
    } catch {
        return err(res, 401, 'Invalid or expired refresh token');
    }
}

// ─── GET /api/v1/users/me ─────────────────────────────────────────────────────
async function GET_users_me(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    return ok(res, {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url || '',
        date_of_birth: user.date_of_birth,
        is_admin: user.is_admin,
        created_at: user.created_at
    });
}

// ─── PUT /api/v1/users/me ─────────────────────────────────────────────────────
async function PUT_update_me(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { username, date_of_birth, avatar_url } = body;

    if (username !== undefined) {
        if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
            return err(
                res,
                400,
                'Username must be 4–20 characters: letters, numbers, and underscore only'
            );
        }
        const { rows: existing } = await sql`
      SELECT id FROM users WHERE username = ${username} AND id != ${user.id}`;
        if (existing.length > 0) return err(res, 400, 'Username already taken');
    }

    const { rows } = await sql`
    UPDATE users SET
      username = COALESCE(${username}, username),
      avatar_url = COALESCE(${avatar_url}, avatar_url),
      date_of_birth = COALESCE(${date_of_birth}, date_of_birth)
    WHERE id = ${user.id}
    RETURNING id, username, email, avatar_url, date_of_birth, is_admin, created_at`;
    return ok(res, rows[0]);
}

// ─── DELETE /api/v1/users/me ──────────────────────────────────────────────────
async function DELETE_delete_me(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    await sql`DELETE FROM users WHERE id = ${user.id}`;
    return ok(res, { success: true });
}

// ─── GET /api/v1/users/{id} ─────────────────────────────────────────────────
async function GET_user_by_id(req, res, id) {
    const { rows } =
        await sql`SELECT id, username, email, avatar_url, date_of_birth, is_admin, created_at FROM users WHERE id = ${id}`;
    if (!rows[0]) return err(res, 404, 'User not found');
    return ok(res, rows[0]);
}

// ─── GET /api/v1/users/{id}/profile ──────────────────────────────────────────
async function GET_user_profile(req, res, id) {
    const { rows } =
        await sql`SELECT id, username, email, avatar_url, date_of_birth, is_admin, created_at FROM users WHERE id = ${id}`;
    if (!rows[0]) return err(res, 404, 'User not found');

    const { rows: followersRows } =
        await sql`SELECT COUNT(*) as count FROM follows WHERE following_id = ${id}`;
    const { rows: followingRows } =
        await sql`SELECT COUNT(*) as count FROM follows WHERE follower_id = ${id}`;
    const { rows: postsRows } =
        await sql`SELECT COUNT(*) as count FROM posts WHERE author_id = ${id}`;

    const followers_count = Number(followersRows[0]?.count || 0);
    const following_count = Number(followingRows[0]?.count || 0);
    const posts_count = Number(postsRows[0]?.count || 0);

    return ok(res, {
        ...rows[0],
        followers_count: parseInt(followers_count),
        following_count: parseInt(following_count),
        posts_count: parseInt(posts_count)
    });
}

// ─── GET /api/v1/users/{id}/posts/ ────────────────────────────────────────────
async function GET_user_posts(req, res, userId) {
    await getUserFromToken(req); // verify auth only

    const { rows: target } =
        await sql`SELECT id FROM users WHERE id = ${userId}`;
    if (!target[0]) return err(res, 404, 'User not found');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let postsQuery;
    if (cursor) {
        postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.author_id = ${userId} AND p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.author_id = ${userId}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows: userPosts } = await postsQuery;
    const hasMore = userPosts.length > limit;
    const rawItems = userPosts.slice(0, limit);

    const { rows: postTopics } =
        await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`;
    const topicsMap = {};
    for (const pt of postTopics) {
        if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = [];
        topicsMap[pt.post_id].push({
            id: pt.id,
            name: pt.name,
            description: pt.description
        });
    }

    const items = rawItems.map((p) => ({
        id: p.id,
        content: p.content,
        author_id: p.author_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        topics: topicsMap[p.id] || [],
        author: {
            id: p['author.id'],
            username: p['author.username'],
            email: p['author.email'],
            date_of_birth: p['author.date_of_birth'],
            is_admin: p['author.is_admin'],
            created_at: p['author.created_at']
        }
    }));

    return ok(res, {
        items,
        next_cursor: hasMore ? String(items[items.length - 1].created_at) : null
    });
}

// ─── GET /api/v1/users/search?q= ────────────────────────────────────────────
async function GET_search_users(req, res) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');

    const q = req.query.q || '';
    if (!q) return ok(res, []);

    const { rows } = await sql`
    SELECT id, username, email, created_at FROM users
    WHERE username ILIKE ${'%' + q + '%'}
    LIMIT 20`;
    return ok(res, rows);
}

// ─── GET /api/v1/posts/feed ───────────────────────────────────────────────────
async function GET_feed(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    const { rows: prefRows } =
        await sql`SELECT topic_ids FROM user_preferences WHERE user_id = ${user.id}`;
    const preferredTopicIds = prefRows[0]?.topic_ids || [];

    const { rows: followRows } =
        await sql`SELECT following_id FROM follows WHERE follower_id = ${user.id}`;
    const followingIds = followRows.map((f) => f.following_id);

    const { rows: postTopics } =
        await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`;
    const topicsMap = {};
    for (const pt of postTopics) {
        if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = [];
        topicsMap[pt.post_id].push({
            id: pt.id,
            name: pt.name,
            description: pt.description
        });
    }

    let postsQuery;
    if (cursor) {
        postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows: allPosts } = await postsQuery;
    const hasMore = allPosts.length > limit;
    const items = allPosts.slice(0, limit).map((post) => {
        let score = 0;
        if (followingIds.includes(post.author_id)) score += 1;
        const postTopicIds = (topicsMap[post.id] || []).map((t) => t.id);
        if (postTopicIds.some((id) => preferredTopicIds.includes(id)))
            score += 2;
        return {
            id: post.id,
            content: post.content,
            author_id: post.author_id,
            created_at: post.created_at,
            updated_at: post.updated_at,
            likes_count: post.likes_count,
            comments_count: post.comments_count,
            topics: topicsMap[post.id] || [],
            author: {
                id: post['author.id'],
                username: post['author.username'],
                email: post['author.email'],
                date_of_birth: post['author.date_of_birth'],
                is_admin: post['author.is_admin'],
                created_at: post['author.created_at']
            },
            feed_score: score
        };
    });

    items.sort(
        (a, b) =>
            b.feed_score - a.feed_score ||
            new Date(b.created_at) - new Date(a.created_at)
    );
    const next_cursor =
        hasMore && items.length > 0 ? items[items.length - 1].created_at : null;
    return ok(res, { items, next_cursor });
}

// ─── GET /api/v1/posts/search ──────────────────────────────────────────────────
async function GET_search_posts(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const q = req.query.q || '';
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let postsQuery;
    if (cursor) {
        postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.content ILIKE ${'%' + q + '%'} AND p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        postsQuery = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.content ILIKE ${'%' + q + '%'}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows } = await postsQuery;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const { rows: postTopics } =
        await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`;
    const topicsMap = {};
    for (const pt of postTopics) {
        if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = [];
        topicsMap[pt.post_id].push({
            id: pt.id,
            name: pt.name,
            description: pt.description
        });
    }

    const posts = items.map((p) => ({
        id: p.id,
        content: p.content,
        author_id: p.author_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        topics: topicsMap[p.id] || [],
        author: {
            id: p['author.id'],
            username: p['author.username'],
            email: p['author.email'],
            date_of_birth: p['author.date_of_birth'],
            is_admin: p['author.is_admin'],
            created_at: p['author.created_at']
        }
    }));

    const next_cursor =
        hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null;
    return ok(res, { items: posts, next_cursor });
}

// ─── GET /api/v1/posts/explore ─────────────────────────────────────────────────
async function GET_explore(req, res) {
    await getUserFromToken(req); // verify auth

    const topicId = req.query.topic_id;
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '10', 10);

    let postsQuery;
    if (topicId) {
        const tid = parseInt(topicId, 10);
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
        LIMIT ${limit + 1}`;
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
        LIMIT ${limit + 1}`;
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
        LIMIT ${limit + 1}`;
        } else {
            postsQuery = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
          u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`;
        }
    }

    const { rows } = await postsQuery;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const { rows: postTopics } =
        await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`;
    const topicsMap = {};
    for (const pt of postTopics) {
        if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = [];
        topicsMap[pt.post_id].push({
            id: pt.id,
            name: pt.name,
            description: pt.description
        });
    }

    const posts = items.map((p) => ({
        id: p.id,
        content: p.content,
        author_id: p.author_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        topics: topicsMap[p.id] || [],
        author: {
            id: p['author.id'],
            username: p['author.username'],
            email: p['author.email'],
            date_of_birth: p['author.date_of_birth'],
            is_admin: p['author.is_admin'],
            created_at: p['author.created_at']
        }
    }));

    const next_cursor =
        hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null;
    return ok(res, { items: posts, next_cursor });
}

// ─── POST /api/v1/posts/ ─────────────────────────────────────────────────────
async function POST_create_post(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { content, topic_ids } = body;

    if (
        !content ||
        typeof content !== 'string' ||
        content.trim().length === 0
    ) {
        return err(res, 400, 'Content is required');
    }
    if (content.trim().length > 5000) {
        return err(res, 400, 'Content must not exceed 5000 characters');
    }

    const { rows } = await sql`
    INSERT INTO posts (content, author_id)
    VALUES (${content}, ${user.id})
    RETURNING *`;
    const post = rows[0];

    if (topic_ids?.length) {
        for (const tid of topic_ids) {
            await sql`INSERT INTO post_topics (post_id, topic_id) VALUES (${post.id}, ${tid}) ON CONFLICT DO NOTHING`;
        }
    }

    const { rows: topicsRows } = await sql`
    SELECT t.id, t.name, t.description FROM post_topics pt
    JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${post.id}`;

    return created(res, {
        id: post.id,
        content: post.content,
        author_id: post.author_id,
        created_at: post.created_at,
        updated_at: post.updated_at,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        topics: topicsRows,
        author: {
            id: user.id,
            username: user.username,
            email: user.email,
            date_of_birth: user.date_of_birth,
            is_admin: user.is_admin,
            created_at: user.created_at
        }
    });
}

// ─── PUT /api/v1/posts/{id} ───────────────────────────────────────────────────
async function PUT_update_post(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const { rows: existing } =
        await sql`SELECT * FROM posts WHERE id = ${postId}`;
    if (!existing[0]) return err(res, 404, 'Post not found');
    if (existing[0].author_id !== user.id)
        return err(res, 403, 'You are not authorized to update this post');

    const body = req.body;
    const { content, topic_ids } = body;

    if (
        content !== undefined &&
        (typeof content !== 'string' || content.trim().length > 5000)
    ) {
        return err(res, 400, 'Content must not exceed 5000 characters');
    }

    const { rows } = await sql`
    UPDATE posts SET
      content = COALESCE(${content}, content),
      updated_at = NOW()
    WHERE id = ${postId}
    RETURNING *`;
    const post = rows[0];

    if (topic_ids !== undefined) {
        await sql`DELETE FROM post_topics WHERE post_id = ${postId}`;
        if (topic_ids.length) {
            for (const tid of topic_ids) {
                await sql`INSERT INTO post_topics (post_id, topic_id) VALUES (${postId}, ${tid})`;
            }
        }
    }

    const { rows: topicsRows } = await sql`
    SELECT t.id, t.name, t.description FROM post_topics pt
    JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${postId}`;

    return ok(res, {
        id: post.id,
        content: post.content,
        author_id: post.author_id,
        created_at: post.created_at,
        updated_at: post.updated_at,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        topics: topicsRows,
        author: {
            id: user.id,
            username: user.username,
            email: user.email,
            date_of_birth: user.date_of_birth,
            is_admin: user.is_admin,
            created_at: user.created_at
        }
    });
}

// ─── DELETE /api/v1/posts/{id} ────────────────────────────────────────────────
async function DELETE_delete_post(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const { rows: existing } =
        await sql`SELECT * FROM posts WHERE id = ${postId}`;
    if (!existing[0]) return err(res, 404, 'Post not found');
    if (existing[0].author_id !== user.id)
        return err(res, 403, 'You are not authorized to delete this post');

    await sql`DELETE FROM posts WHERE id = ${postId}`;
    return noContent(res);
}

// ─── GET /api/v1/posts/{id} ───────────────────────────────────────────────────
async function GET_post(req, res, id) {
    await getUserFromToken(req); // verify auth

    const { rows } = await sql`
    SELECT p.*,
      u.id as "author.id", u.username as "author.username", u.email as "author.email",
      u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
    FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ${id}`;
    if (!rows[0]) return err(res, 404, 'Post not found');

    const p = rows[0];
    const { rows: topicsRows } =
        await sql`SELECT t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${id}`;

    return ok(res, {
        id: p.id,
        content: p.content,
        author_id: p.author_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        topics: topicsRows,
        author: {
            id: p['author.id'],
            username: p['author.username'],
            email: p['author.email'],
            date_of_birth: p['author.date_of_birth'],
            is_admin: p['author.is_admin'],
            created_at: p['author.created_at']
        }
    });
}

// ─── GET /api/v1/posts/{id}/comments/ ────────────────────────────────────────
async function GET_comments(req, res, postId) {
    await getUserFromToken(req);

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let query;
    if (cursor) {
        query = sql`
      SELECT c.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.avatar_url as "author.avatar_url", u.created_at as "author.created_at"
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ${postId} AND c.id > ${parseInt(cursor, 10)}
      ORDER BY c.id ASC LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT c.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.avatar_url as "author.avatar_url", u.created_at as "author.created_at"
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ${postId}
      ORDER BY c.id ASC LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((c) => ({
        id: c.id,
        content: c.content,
        post_id: c.post_id,
        author_id: c.author_id,
        parent_id: c.parent_id,
        created_at: c.created_at,
        author: {
            id: c['author.id'],
            username: c['author.username'],
            email: c['author.email'],
            avatar_url: c['author.avatar_url'],
            created_at: c['author.created_at']
        }
    }));
    const next_cursor =
        hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;
    return ok(res, { comments: items, next_cursor });
}

// ─── POST /api/v1/posts/{id}/comments/ ────────────────────────────────────────
async function POST_create_comment(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const { rows: post } =
        await sql`SELECT id, author_id FROM posts WHERE id = ${postId}`;
    if (!post[0]) return err(res, 404, 'Post not found');

    const body = req.body;
    const { content, parent_id } = body;

    if (
        !content ||
        typeof content !== 'string' ||
        content.trim().length === 0
    ) {
        return err(res, 400, 'Comment content is required');
    }
    if (content.trim().length > 1000) {
        return err(res, 400, 'Comment must not exceed 1000 characters');
    }

    const { rows } = await sql`
    INSERT INTO comments (content, post_id, author_id, parent_id)
    VALUES (${content}, ${postId}, ${user.id}, ${parent_id || null})
    RETURNING *`;

    await sql`UPDATE posts SET comments_count = comments_count + 1 WHERE id = ${postId}`;

    if (post[0].author_id !== user.id) {
        await createNotification(
            post[0].author_id,
            'comment',
            {
                actor_id: user.id,
                actor_username: user.username,
                post_id: Number(postId)
            },
            user.avatar_url
        );
    }

    const comment = rows[0];
    return created(res, {
        id: comment.id,
        content: comment.content,
        post_id: comment.post_id,
        author_id: comment.author_id,
        parent_id: comment.parent_id,
        created_at: comment.created_at,
        author: {
            id: user.id,
            username: user.username,
            email: user.email,
            created_at: user.created_at
        }
    });
}

// ─── POST /api/v1/likes/posts/{id}/like/ ──────────────────────────────────────
async function POST_like(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const { rows: post } =
        await sql`SELECT id, author_id FROM posts WHERE id = ${postId}`;
    if (!post[0]) return err(res, 404, 'Post not found');

    try {
        await sql`INSERT INTO likes (user_id, post_id) VALUES (${user.id}, ${postId})`;
        await sql`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}`;
        if (post[0].author_id !== user.id) {
            await createNotification(
                post[0].author_id,
                'like',
                {
                    actor_id: user.id,
                    actor_username: user.username,
                    post_id: Number(postId)
                },
                user.avatar_url
            );
        }
        return created(res, { liked: true });
    } catch (e) {
        if (e.code === '23505') return err(res, 400, 'Already liked');
        throw e;
    }
}

// ─── DELETE /api/v1/likes/posts/{id}/like/ ────────────────────────────────────
async function DELETE_unlike(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const result =
        await sql`DELETE FROM likes WHERE user_id = ${user.id} AND post_id = ${postId} RETURNING *`;
    if (!result.rowCount) return err(res, 404, 'Like not found');
    await sql`UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}`;
    return ok(res, { liked: false });
}

// ─── POST /api/v1/follows/users/{id}/follow/ ─────────────────────────────────
async function POST_follow(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');
    if (me.id === Number(userId))
        return err(res, 400, 'Cannot follow yourself');

    const { rows: target } =
        await sql`SELECT id FROM users WHERE id = ${userId}`;
    if (!target[0]) return err(res, 404, 'User not found');

    try {
        await sql`INSERT INTO follows (follower_id, following_id) VALUES (${me.id}, ${userId})`;
        await createNotification(
            userId,
            'follow',
            {
                actor_id: me.id,
                actor_username: me.username
            },
            me.avatar_url
        );
        return created(res, { following: true });
    } catch (e) {
        if (e.code === '23505') return err(res, 400, 'Already following');
        throw e;
    }
}

// ─── DELETE /api/v1/follows/users/{id}/follow/ ────────────────────────────────
async function DELETE_unfollow(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');

    const result =
        await sql`DELETE FROM follows WHERE follower_id = ${me.id} AND following_id = ${userId} RETURNING *`;
    if (!result.rowCount) return err(res, 404, 'Not following');
    return ok(res, { following: false });
}

// ─── GET /api/v1/follows/users/{id}/followers/ ────────────────────────────────
async function GET_followers(req, res, userId) {
    await getUserFromToken(req);
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let query;
    if (cursor) {
        query = sql`
      SELECT u.id, u.username, u.email, u.created_at, f.created_at as follow_created_at FROM follows f
      JOIN users u ON u.id = f.follower_id WHERE f.following_id = ${userId} AND f.created_at < ${cursor}
      ORDER BY f.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT u.id, u.username, u.email, u.created_at, f.created_at as follow_created_at FROM follows f
      JOIN users u ON u.id = f.follower_id WHERE f.following_id = ${userId}
      ORDER BY f.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const responseItems = items.map((r) => ({
        id: r.id,
        username: r.username,
        email: r.email,
        created_at: r.created_at
    }));

    const next_cursor =
        hasMore && items.length > 0
            ? String(items[items.length - 1].follow_created_at)
            : null;
    return ok(res, { items: responseItems, next_cursor });
}

// ─── GET /api/v1/follows/users/{id}/following/ ────────────────────────────────
async function GET_following(req, res, userId) {
    await getUserFromToken(req);
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let query;
    if (cursor) {
        query = sql`
      SELECT u.id, u.username, u.email, u.created_at, f.created_at as follow_created_at FROM follows f
      JOIN users u ON u.id = f.following_id WHERE f.follower_id = ${userId} AND f.created_at < ${cursor}
      ORDER BY f.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT u.id, u.username, u.email, u.created_at, f.created_at as follow_created_at FROM follows f
      JOIN users u ON u.id = f.following_id WHERE f.follower_id = ${userId}
      ORDER BY f.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const responseItems = items.map((r) => ({
        id: r.id,
        username: r.username,
        email: r.email,
        created_at: r.created_at
    }));

    const next_cursor =
        hasMore && items.length > 0
            ? String(items[items.length - 1].follow_created_at)
            : null;
    return ok(res, { items: responseItems, next_cursor });
}

// ─── GET /api/v1/follows/users/{id}/status/ ──────────────────────────────────
async function GET_follow_status(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');
    const { rows } =
        await sql`SELECT 1 FROM follows WHERE follower_id = ${me.id} AND following_id = ${userId} LIMIT 1`;
    return ok(res, { following: rows.length > 0 });
}

// ─── GET /api/v1/topics/ ───────────────────────────────────────────────────────
async function GET_topics(req, res) {
    const { rows } = await sql`SELECT * FROM topics ORDER BY id`;
    return ok(res, rows);
}

// ─── GET /api/v1/preferences/users/me/preferences ─────────────────────────────
async function GET_preferences(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const { rows } =
        await sql`SELECT topic_ids FROM user_preferences WHERE user_id = ${user.id}`;
    const topicIds = rows[0]?.topic_ids || [];

    const { rows: topicRows } =
        await sql`SELECT * FROM topics WHERE id = ANY(${topicIds})`;
    return ok(res, { topics: topicRows });
}

// ─── PUT /api/v1/preferences/users/me/preferences ─────────────────────────────
async function PUT_update_preferences(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { topic_ids } = body;
    if (!Array.isArray(topic_ids))
        return err(res, 400, 'topic_ids must be an array');

    const { rowCount } =
        await sql`UPDATE user_preferences SET topic_ids = ${topic_ids}, updated_at = NOW() WHERE user_id = ${user.id}`;
    if (!rowCount) {
        await sql`INSERT INTO user_preferences (user_id, topic_ids, updated_at) VALUES (${user.id}, ${topic_ids}, NOW())`;
    }

    const { rows: topicRows } =
        await sql`SELECT * FROM topics WHERE id = ANY(${topic_ids})`;
    return ok(res, { topics: topicRows });
}

// ─── POST /api/v1/users/me/change-password ───────────────────────────────────
async function POST_change_password(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { current_password, new_password } = body;
    if (!current_password || !new_password)
        return err(res, 400, 'current_password and new_password are required');

    const valid = await bcrypt.compare(current_password, user.hashed_password);
    if (!valid) return err(res, 400, 'Current password is incorrect');

    const hashed = await bcrypt.hash(new_password, 10);
    await sql`UPDATE users SET hashed_password = ${hashed} WHERE id = ${user.id}`;
    return ok(res, { success: true });
}

// ─── GET /api/v1/health ───────────────────────────────────────────────────────
async function GET_health(req, res) {
    return ok(res, { status: 'ok' });
}

// ─── GET /api/v1/likes/posts/{id}/status/ ───────────────────────────────────
async function GET_like_status(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    const { rows } =
        await sql`SELECT 1 FROM likes WHERE user_id = ${user.id} AND post_id = ${postId} LIMIT 1`;
    return ok(res, { liked: rows.length > 0 });
}

function normalizeNotificationData(rawData) {
    let data = {};

    if (typeof rawData === 'string') {
        try {
            const parsed = JSON.parse(rawData);
            if (parsed && typeof parsed === 'object') {
                data = parsed;
            }
        } catch {
            data = {};
        }
    } else if (rawData && typeof rawData === 'object') {
        data = rawData;
    }

    return {
        actor_username: data.actor_username || data.actorUsername,
        actor_id: data.actor_id ?? data.actorId,
        post_id: data.post_id ?? data.postId,
        comment_id: data.comment_id ?? data.commentId,
        message: data.message || data.messageText
    };
}

async function enrichNotifications(rows) {
    const actorIds = [
        ...new Set(
            rows
                .map((row) =>
                    Number(normalizeNotificationData(row.data).actor_id)
                )
                .filter((actorId) => Number.isFinite(actorId))
        )
    ];

    const actorMap = new Map();
    if (actorIds.length > 0) {
        const { rows: users } = await sql`
      SELECT id, username, avatar_url
      FROM users
      WHERE id = ANY(${actorIds})`;

        for (const user of users) {
            actorMap.set(Number(user.id), user);
        }
    }

    return rows.map((row) => {
        const normalizedData = normalizeNotificationData(row.data);
        const actorId = Number(normalizedData.actor_id);
        const actor = Number.isFinite(actorId) ? actorMap.get(actorId) : null;
        return {
            ...row,
            data: {
                ...normalizedData,
                actor_username:
                    normalizedData.actor_username || actor?.username,
                actor_id: normalizedData.actor_id ?? actor?.id,
                post_id: normalizedData.post_id,
                comment_id: normalizedData.comment_id,
                message: normalizedData.message
            },
            actor_avatar_url: row.actor_avatar_url || actor?.avatar_url || ''
        };
    });
}

// ─── GET /api/v1/notifications/ ───────────────────────────────────────────────
async function GET_notifications(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let query;
    if (cursor) {
        query = sql`
      SELECT id, user_id, type, data, actor_avatar_url, is_read, created_at
      FROM notifications WHERE user_id = ${user.id} AND id < ${parseInt(cursor, 10)}
      ORDER BY id DESC LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT id, user_id, type, data, actor_avatar_url, is_read, created_at
      FROM notifications WHERE user_id = ${user.id}
      ORDER BY id DESC LIMIT ${limit + 1}`;
    }
    const { rows } = await query;
    const enrichedRows = await enrichNotifications(rows);
    const hasMore = rows.length > limit;
    const items = enrichedRows.slice(0, limit);

    const next_cursor =
        hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;
    return ok(res, { notifications: items, next_cursor });
}

// ─── GET /api/v1/notifications/stream ────────────────────────────────────────
async function GET_notifications_stream(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    req.setTimeout(0);
    res.status(200);
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const userId = Number(user.id);
    const clients = notificationClients.get(userId) || new Set();
    clients.add(res);
    notificationClients.set(userId, clients);

    const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
        if (clients.size === 0) notificationClients.delete(userId);
    });
}

// ─── GET /api/v1/notifications/unread-count ───────────────────────────────────
async function GET_notifications_unread(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    // const [{ count }] = await sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${user.id} AND is_read = FALSE`
    // return ok(res, { count: parseInt(count) })
    const { rows } =
        await sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${user.id} AND is_read = FALSE`;
    return ok(res, { count: Number(rows[0]?.count || 0) });
}

// ─── PUT /api/v1/notifications/{id}/read ─────────────────────────────────────
async function PUT_notification_read(req, res, notifId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${notifId} AND user_id = ${user.id}`;
    return noContent(res);
}

// ─── PUT /api/v1/notifications/read-all ─────────────────────────────────────
async function PUT_notifications_read_all(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${user.id}`;
    return noContent(res);
}

// ─── GET /api/v1/bookmarks/ ───────────────────────────────────────────────────
async function GET_bookmarks(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    let query;
    if (cursor) {
        query = sql`
      SELECT p.*, b.created_at as bookmarked_at,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id
      JOIN users u ON u.id = p.author_id
      WHERE b.user_id = ${user.id} AND b.created_at < ${cursor}
      ORDER BY b.created_at DESC LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT p.*, b.created_at as bookmarked_at,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id
      JOIN users u ON u.id = p.author_id
      WHERE b.user_id = ${user.id}
      ORDER BY b.created_at DESC LIMIT ${limit + 1}`;
    }
    const { rows } = await query;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const { rows: postTopics } =
        await sql`SELECT pt.post_id, t.id, t.name, t.description FROM post_topics pt JOIN topics t ON t.id = pt.topic_id`;
    const topicsMap = {};
    for (const pt of postTopics) {
        if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = [];
        topicsMap[pt.post_id].push({
            id: pt.id,
            name: pt.name,
            description: pt.description
        });
    }

    const posts = items.map((p) => ({
        id: p.id,
        content: p.content,
        author_id: p.author_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        topics: topicsMap[p.id] || [],
        author: {
            id: p['author.id'],
            username: p['author.username'],
            email: p['author.email'],
            date_of_birth: p['author.date_of_birth'],
            is_admin: p['author.is_admin'],
            created_at: p['author.created_at']
        }
    }));

    const next_cursor =
        hasMore && posts.length > 0
            ? String(items[items.length - 1].bookmarked_at)
            : null;
    return ok(res, { posts, next_cursor });
}

// ─── GET /api/v1/bookmarks/posts/{id}/status ─────────────────────────────────
async function GET_bookmark_status(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const { rows } = await sql`
        SELECT 1 FROM bookmarks WHERE user_id = ${user.id} AND post_id = ${postId}
    `;
    return ok(res, { bookmarked: rows.length > 0 });
}

// ─── POST /api/v1/bookmarks/posts/{id}/ ──────────────────────────────────────
async function POST_bookmark(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    const { rows: post } = await sql`SELECT id FROM posts WHERE id = ${postId}`;
    if (!post[0]) return err(res, 404, 'Post not found');
    try {
        await sql`INSERT INTO bookmarks (user_id, post_id) VALUES (${user.id}, ${postId})`;
        return created(res, { bookmarked: true });
    } catch (e) {
        if (e.code === '23505') return ok(res, { bookmarked: true });
        throw e;
    }
}

// ─── DELETE /api/v1/bookmarks/posts/{id}/ ────────────────────────────────────
async function DELETE_unbookmark(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    const result =
        await sql`DELETE FROM bookmarks WHERE user_id = ${user.id} AND post_id = ${postId} RETURNING *`;
    if (!result.rowCount) return ok(res, { bookmarked: false });
    return ok(res, { bookmarked: false });
}

// ─── Helper ────────────────────────────────────────────────────────────────────────
function getPaginationFromQuery(req) {
    const skip = parseInt(req.query.skip || req.query.cursor || '0', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    return { skip, limit };
}

// ─── Server ────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// GET routes
app.get('/health', GET_health);
app.get('/api/v1/health', GET_health);
app.get('/api/v1/topics/', GET_topics);
app.get('/api/v1/posts/feed', GET_feed);
app.get('/api/v1/posts/explore', GET_explore);
app.get('/api/v1/posts/search', GET_search_posts);
app.get('/api/v1/posts/:id/comments/', (req, res) =>
    GET_comments(req, res, req.params.id)
);
app.get('/api/v1/posts/:id', (req, res) => GET_post(req, res, req.params.id));
app.get('/api/v1/users/me', GET_users_me);
app.get('/api/v1/users/search', GET_search_users);
app.get('/api/v1/users/:id/profile', (req, res) =>
    GET_user_profile(req, res, req.params.id)
);
app.get('/api/v1/users/:id/posts/', (req, res) =>
    GET_user_posts(req, res, req.params.id)
);
app.get('/api/v1/users/:id', (req, res) =>
    GET_user_by_id(req, res, req.params.id)
);
app.get('/api/v1/follows/users/:id/followers/', (req, res) =>
    GET_followers(req, res, req.params.id)
);
app.get('/api/v1/follows/users/:id/following/', (req, res) =>
    GET_following(req, res, req.params.id)
);
app.get('/api/v1/follows/users/:id/status/', (req, res) =>
    GET_follow_status(req, res, req.params.id)
);
app.get('/api/v1/preferences/users/me/preferences', GET_preferences);
app.get('/api/v1/likes/posts/:id/status/', (req, res) =>
    GET_like_status(req, res, req.params.id)
);
app.get('/api/v1/notifications/', GET_notifications);
app.get('/api/v1/notifications/unread-count', GET_notifications_unread);
app.get('/api/v1/notifications/stream', GET_notifications_stream);
app.get('/api/v1/bookmarks/', GET_bookmarks);
app.get('/api/v1/bookmarks/posts/:id/status', (req, res) =>
    GET_bookmark_status(req, res, req.params.id)
);

// POST routes
app.post('/api/v1/auth/login', POST_auth_login);
app.post('/api/v1/auth/register', POST_auth_register);
app.post('/api/v1/auth/refresh', POST_auth_refresh);
app.post('/api/v1/posts/', POST_create_post);
app.post('/api/v1/posts/:id/comments/', (req, res) =>
    POST_create_comment(req, res, req.params.id)
);
app.post('/api/v1/users/me/change-password', POST_change_password);
app.post('/api/v1/likes/posts/:id/like/', (req, res) =>
    POST_like(req, res, req.params.id)
);
app.post('/api/v1/follows/users/:id/follow/', (req, res) =>
    POST_follow(req, res, req.params.id)
);
app.post('/api/v1/bookmarks/posts/:id/', (req, res) =>
    POST_bookmark(req, res, req.params.id)
);

// PUT routes
app.put('/api/v1/posts/:id', (req, res) =>
    PUT_update_post(req, res, req.params.id)
);
app.put('/api/v1/users/me', PUT_update_me);
app.put('/api/v1/preferences/users/me/preferences', PUT_update_preferences);
app.put('/api/v1/notifications/read-all', PUT_notifications_read_all);
app.put('/api/v1/notifications/:id/read', (req, res) =>
    PUT_notification_read(req, res, req.params.id)
);

// DELETE routes
app.delete('/api/v1/posts/:id', (req, res) =>
    DELETE_delete_post(req, res, req.params.id)
);
app.delete('/api/v1/likes/posts/:id/like/', (req, res) =>
    DELETE_unlike(req, res, req.params.id)
);
app.delete('/api/v1/follows/users/:id/follow/', (req, res) =>
    DELETE_unfollow(req, res, req.params.id)
);
app.delete('/api/v1/users/me', DELETE_delete_me);
app.delete('/api/v1/bookmarks/posts/:id/', (req, res) =>
    DELETE_unbookmark(req, res, req.params.id)
);

// Error handler
app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ detail: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

async function start() {
    await initDb();
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
