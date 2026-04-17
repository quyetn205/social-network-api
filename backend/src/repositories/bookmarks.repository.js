import { sql } from '../../db.js';

// Lấy danh sách bài đã bookmark của người dùng theo cursor.
export async function selectBookmarkedPosts(userId, cursor, limit) {
    let query;
    if (cursor) {
        query = sql`
      SELECT p.*, b.created_at as bookmarked_at,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
                u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id
      JOIN users u ON u.id = p.author_id
      WHERE b.user_id = ${userId} AND b.created_at < ${cursor}
      ORDER BY b.created_at DESC LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT p.*, b.created_at as bookmarked_at,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
                u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id
      JOIN users u ON u.id = p.author_id
      WHERE b.user_id = ${userId}
      ORDER BY b.created_at DESC LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    return {
        rows: rows.slice(0, limit),
        hasMore: rows.length > limit
    };
}

// Kiểm tra người dùng đã bookmark bài viết hay chưa.
export async function selectBookmarkStatus(userId, postId) {
    const { rows } = await sql`
        SELECT 1 FROM bookmarks WHERE user_id = ${userId} AND post_id = ${postId}
    `;
    return rows.length > 0;
}

// Kiểm tra bài viết có tồn tại không.
export async function selectPostExists(postId) {
    const { rows } = await sql`SELECT id FROM posts WHERE id = ${postId}`;
    return Boolean(rows[0]);
}

// Tạo bookmark cho người dùng.
export async function insertBookmark(userId, postId) {
    await sql`INSERT INTO bookmarks (user_id, post_id) VALUES (${userId}, ${postId})`;
}

// Xóa bookmark của người dùng.
export async function deleteBookmark(userId, postId) {
    const result =
        await sql`DELETE FROM bookmarks WHERE user_id = ${userId} AND post_id = ${postId} RETURNING *`;
    return result.rowCount > 0;
}

// Tạo map post_id -> danh sách chủ đề để render bookmark.
export async function selectTopicsMap() {
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
    return topicsMap;
}
