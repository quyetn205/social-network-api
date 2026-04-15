import { sql } from '../../db.js';

export async function selectNotifications(userId, cursor, limit) {
    let query;
    if (cursor) {
        query = sql`
      SELECT id, user_id, type, data, actor_avatar_url, is_read, created_at
      FROM notifications WHERE user_id = ${userId} AND id < ${parseInt(cursor, 10)}
      ORDER BY id DESC LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT id, user_id, type, data, actor_avatar_url, is_read, created_at
      FROM notifications WHERE user_id = ${userId}
      ORDER BY id DESC LIMIT ${limit + 1}`;
    }
    const { rows } = await query;
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function selectNotificationActorUsers(actorIds) {
    const { rows } = await sql`
      SELECT id, username, avatar_url
      FROM users
      WHERE id = ANY(${actorIds})`;
    return rows;
}

export async function countUnreadNotifications(userId) {
    const { rows } =
        await sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND is_read = FALSE`;
    return Number(rows[0]?.count || 0);
}

export async function markNotificationRead(userId, notifId) {
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${notifId} AND user_id = ${userId}`;
}

export async function markAllNotificationsRead(userId) {
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${userId}`;
}
