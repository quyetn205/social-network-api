import { sql } from '../../db.js';
import jwt from 'jsonwebtoken';

const SECRET = process.env.SECRET_KEY || 'fallback-secret';
const ALGORITHM = process.env.ALGORITHM || 'HS256';
const EXPIRE_MINUTES = parseInt(
    process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '15',
    10
);

export function signToken(userId, type = 'access') {
    const expiresIn = type === 'refresh' ? '7d' : `${EXPIRE_MINUTES}m`;
    return jwt.sign({ sub: userId, type }, SECRET, {
        algorithm: ALGORITHM,
        expiresIn
    });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });
    } catch {
        return null;
    }
}

export async function getUserFromToken(req) {
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

export function ok(res, data) {
    res.json(data);
}

export function created(res, data) {
    res.status(201).json(data);
}

export function noContent(res) {
    res.sendStatus(204);
}

export function err(res, status, msg) {
    res.status(status).json({ detail: msg });
}

export function rateLimitResponse(res, retryAfter) {
    res.status(429)
        .set('Retry-After', String(retryAfter))
        .json({ detail: 'Too many requests. Please try again later.' });
}

export const notificationClients = new Map();

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

export async function createNotification(userId, type, data, actorAvatarUrl) {
    const { rows } = await sql`
      INSERT INTO notifications (user_id, type, data, actor_avatar_url)
      VALUES (${userId}, ${type}, ${JSON.stringify(data)}, ${actorAvatarUrl || null})
      RETURNING id, user_id, type, data, actor_avatar_url, is_read, created_at`;
    const notification = rows[0];
    if (notification) broadcastNotification(userId, notification);
    return notification;
}
