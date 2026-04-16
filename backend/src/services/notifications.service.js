import {
    err,
    getUserFromToken,
    noContent,
    notificationClients,
    ok
} from '../controllers/shared.controller.js';
import {
    countUnreadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    selectNotificationActorUsers,
    selectNotifications
} from '../repositories/notifications.repository.js';
import { sql } from '../../db.js';

// Chuẩn hóa dữ liệu thông báo.
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

// Bổ sung dữ liệu người tạo thông báo.
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
        const users = await selectNotificationActorUsers(actorIds);
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

// Lấy danh sách thông báo.
export async function GET_notifications(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);
    const { rows, hasMore } = await selectNotifications(user.id, cursor, limit);
    const enrichedRows = await enrichNotifications(rows);
    const next_cursor =
        hasMore && enrichedRows.length > 0
            ? String(enrichedRows[enrichedRows.length - 1].id)
            : null;
    return ok(res, { notifications: enrichedRows, next_cursor });
}

// Mở luồng SSE cho thông báo.
export async function GET_notifications_stream(req, res) {
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

// Đếm thông báo chưa đọc.
export async function GET_notifications_unread(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    const count = await countUnreadNotifications(user.id);
    return ok(res, { count });
}

// Đánh dấu một thông báo đã đọc.
export async function PUT_notification_read(req, res, notifId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    await markNotificationRead(user.id, notifId);
    return noContent(res);
}

// Đánh dấu tất cả thông báo đã đọc.
export async function PUT_notifications_read_all(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    await markAllNotificationsRead(user.id);
    return noContent(res);
}
