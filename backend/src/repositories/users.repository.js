import { sql } from '../../db.js';

export async function selectPublicUserById(userId) {
    const { rows } =
        await sql`SELECT id, username, email, avatar_url, date_of_birth, is_admin, created_at FROM users WHERE id = ${userId}`;
    return rows[0] || null;
}

export async function updateMe(
    userId,
    { username, date_of_birth, avatar_url }
) {
    const { rows } = await sql`
    UPDATE users SET
      username = COALESCE(${username}, username),
      avatar_url = COALESCE(${avatar_url}, avatar_url),
      date_of_birth = COALESCE(${date_of_birth}, date_of_birth)
    WHERE id = ${userId}
    RETURNING id, username, email, avatar_url, date_of_birth, is_admin, created_at`;
    return rows[0] || null;
}

export async function usernameTaken(username, userId) {
    const { rows } = await sql`
      SELECT id FROM users WHERE username = ${username} AND id != ${userId}`;
    return rows.length > 0;
}

export async function deleteUserById(userId) {
    await sql`DELETE FROM users WHERE id = ${userId}`;
}

export async function countFollowers(userId) {
    const { rows } =
        await sql`SELECT COUNT(*) as count FROM follows WHERE following_id = ${userId}`;
    return Number(rows[0]?.count || 0);
}

export async function countFollowing(userId) {
    const { rows } =
        await sql`SELECT COUNT(*) as count FROM follows WHERE follower_id = ${userId}`;
    return Number(rows[0]?.count || 0);
}

export async function countPosts(userId) {
    const { rows } =
        await sql`SELECT COUNT(*) as count FROM posts WHERE author_id = ${userId}`;
    return Number(rows[0]?.count || 0);
}

export async function selectUserPosts(userId, cursor, limit) {
    let query;
    if (cursor) {
        query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.author_id = ${userId} AND p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
        u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.author_id = ${userId}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function selectPostTopicsMap() {
    const { rows: postTopics } = await sql`
      SELECT pt.post_id, t.id, t.name, t.description
      FROM post_topics pt
      JOIN topics t ON t.id = pt.topic_id`;
    const topicsMap = {};
    for (const pt of postTopics) {
        if (!topicsMap[pt.post_id]) topicsMap[pt.post_id] = [];
        topicsMap[pt.post_id].push({
            id: pt.id,
            name: pt.name,
            description: pt.description
        });
    }
    return topicsMap;
}

export async function searchUsers(q) {
    const { rows } = await sql`
    SELECT id, username, email, created_at FROM users
    WHERE username ILIKE ${'%' + q + '%'}
    LIMIT 20`;
    return rows;
}

export async function selectCurrentUser(userId) {
    const { rows } = await sql`SELECT * FROM users WHERE id = ${userId}`;
    return rows[0] || null;
}

export async function updatePassword(userId, hashedPassword) {
    await sql`UPDATE users SET hashed_password = ${hashedPassword} WHERE id = ${userId}`;
}
