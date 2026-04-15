import { sql } from '../../db.js';

export async function selectUserExists(userId) {
    const { rows } = await sql`SELECT id FROM users WHERE id = ${userId}`;
    return Boolean(rows[0]);
}

export async function insertFollow(followerId, followingId) {
    await sql`INSERT INTO follows (follower_id, following_id) VALUES (${followerId}, ${followingId})`;
}

export async function deleteFollow(followerId, followingId) {
    const result =
        await sql`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId} RETURNING *`;
    return result.rowCount > 0;
}

export async function selectFollowRows(userId, direction, cursor, limit) {
    const column = direction === 'followers' ? 'following_id' : 'follower_id';
    const joinColumn =
        direction === 'followers' ? 'follower_id' : 'following_id';
    let query;
    if (cursor) {
        query = sql`
      SELECT u.id, u.username, u.email, u.created_at, f.created_at as follow_created_at FROM follows f
      JOIN users u ON u.id = f.${joinColumn} WHERE f.${column} = ${userId} AND f.created_at < ${cursor}
      ORDER BY f.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT u.id, u.username, u.email, u.created_at, f.created_at as follow_created_at FROM follows f
      JOIN users u ON u.id = f.${joinColumn} WHERE f.${column} = ${userId}
      ORDER BY f.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function selectFollowStatus(followerId, followingId) {
    const { rows } =
        await sql`SELECT 1 FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId} LIMIT 1`;
    return rows.length > 0;
}
