import { sql } from '../../db.js';

// Lấy danh sách chủ đề ưu tiên của người dùng.
export async function selectPreferenceTopicIds(userId) {
    const { rows } =
        await sql`SELECT topic_ids FROM user_preferences WHERE user_id = ${userId}`;
    return rows[0]?.topic_ids || [];
}

// Lấy danh sách id người dùng mà một người đang theo dõi.
export async function selectFollowingIds(userId) {
    const { rows } =
        await sql`SELECT following_id FROM follows WHERE follower_id = ${userId}`;
    return rows.map((row) => row.following_id);
}

// Tạo map post_id -> danh sách chủ đề của bài viết.
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

// Lấy danh sách bài viết cho feed theo cursor.
export async function selectFeedPosts(cursor, limit) {
    let query;
    if (cursor) {
        query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
                u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
                u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    }
    const { rows } = await query;
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// Tìm bài viết theo nội dung và hỗ trợ phân trang cursor.
export async function selectSearchPosts(q, cursor, limit) {
    let query;
    if (cursor) {
        query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
                u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.content ILIKE ${'%' + q + '%'} AND p.created_at < ${cursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    } else {
        query = sql`
      SELECT p.*,
        u.id as "author.id", u.username as "author.username", u.email as "author.email",
                u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.content ILIKE ${'%' + q + '%'}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`;
    }
    const { rows } = await query;
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// Lấy bài khám phá theo chủ đề (nếu có) và phân trang cursor.
export async function selectExplorePosts(topicId, cursor, limit) {
    let query;
    if (topicId) {
        const tid = parseInt(topicId, 10);
        if (cursor) {
            query = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
                    u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        JOIN post_topics pt ON pt.post_id = p.id
        WHERE pt.topic_id = ${tid} AND p.created_at < ${cursor}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`;
        } else {
            query = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
                    u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        JOIN post_topics pt ON pt.post_id = p.id
        WHERE pt.topic_id = ${tid}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`;
        }
    } else if (cursor) {
        query = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
                    u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.created_at < ${cursor}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`;
    } else {
        query = sql`
        SELECT p.*,
          u.id as "author.id", u.username as "author.username", u.email as "author.email",
                    u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
        FROM posts p
        JOIN users u ON u.id = p.author_id
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}`;
    }

    const { rows } = await query;
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// Lấy chi tiết một bài viết kèm thông tin tác giả.
export async function selectPostById(id) {
    const { rows } = await sql`
    SELECT p.*,
      u.id as "author.id", u.username as "author.username", u.email as "author.email",
            u.avatar_url as "author.avatar_url", u.date_of_birth as "author.date_of_birth", u.is_admin as "author.is_admin", u.created_at as "author.created_at"
    FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ${id}`;
    return rows[0] || null;
}

// Lấy danh sách chủ đề của một bài viết.
export async function selectPostTopicsForPost(postId) {
    const { rows } = await sql`
    SELECT t.id, t.name, t.description FROM post_topics pt
    JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = ${postId}`;
    return rows;
}

// Lấy thông tin tác giả của bài viết.
export async function selectPostAuthor(postId) {
    const { rows } =
        await sql`SELECT id, author_id FROM posts WHERE id = ${postId}`;
    return rows[0] || null;
}

// Tạo bài viết mới.
export async function insertPost(
    content,
    authorId,
    imageUrl = null,
    visibility = 'public'
) {
    const { rows } = await sql`
    INSERT INTO posts (content, image_url, author_id, visibility)
    VALUES (${content}, ${imageUrl}, ${authorId}, ${visibility})
    RETURNING *`;
    return rows[0];
}

// Gắn danh sách chủ đề cho bài viết.
export async function insertPostTopics(postId, topicIds) {
    for (const topicId of topicIds || []) {
        await sql`INSERT INTO post_topics (post_id, topic_id) VALUES (${postId}, ${topicId}) ON CONFLICT DO NOTHING`;
    }
}

// Thay toàn bộ chủ đề của bài viết bằng danh sách mới.
export async function replacePostTopics(postId, topicIds) {
    await sql`DELETE FROM post_topics WHERE post_id = ${postId}`;
    for (const topicId of topicIds || []) {
        await sql`INSERT INTO post_topics (post_id, topic_id) VALUES (${postId}, ${topicId})`;
    }
}

// Cập nhật nội dung bài viết.
export async function updatePostContent(postId, content) {
    const { rows } = await sql`
    UPDATE posts SET
      content = COALESCE(${content}, content),
      updated_at = NOW()
    WHERE id = ${postId}
    RETURNING *`;
    return rows[0] || null;
}

// Cập nhật nội dung, ảnh và quyền hiển thị bài viết.
export async function updatePostDetails(postId, content, imageUrl, visibility) {
    const { rows } = await sql`
        UPDATE posts SET
            content = COALESCE(${content}, content),
            image_url = ${imageUrl},
            visibility = COALESCE(${visibility}, visibility),
            updated_at = NOW()
        WHERE id = ${postId}
        RETURNING *`;
    return rows[0] || null;
}

// Xóa bài viết theo id.
export async function deletePost(postId) {
    await sql`DELETE FROM posts WHERE id = ${postId}`;
}

// Tạo bình luận mới cho bài viết.
export async function insertComment(content, postId, userId, parentId) {
    const { rows } = await sql`
    INSERT INTO comments (content, post_id, author_id, parent_id)
    VALUES (${content}, ${postId}, ${userId}, ${parentId || null})
    RETURNING *`;
    return rows[0];
}

// Lấy danh sách bình luận của bài viết theo cursor.
export async function selectComments(postId, cursor, limit) {
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
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// Tăng bộ đếm số bình luận của bài viết.
export async function incrementCommentsCount(postId) {
    await sql`UPDATE posts SET comments_count = comments_count + 1 WHERE id = ${postId}`;
}

// Kiểm tra người dùng đã like bài viết hay chưa.
export async function selectLikeStatus(userId, postId) {
    const { rows } =
        await sql`SELECT 1 FROM likes WHERE user_id = ${userId} AND post_id = ${postId} LIMIT 1`;
    return rows.length > 0;
}

// Tạo bản ghi like cho bài viết.
export async function insertLike(userId, postId) {
    await sql`INSERT INTO likes (user_id, post_id) VALUES (${userId}, ${postId})`;
}

// Tăng bộ đếm lượt like của bài viết.
export async function incrementLikesCount(postId) {
    await sql`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}`;
}

// Xóa like của người dùng trên bài viết.
export async function deleteLike(userId, postId) {
    const result =
        await sql`DELETE FROM likes WHERE user_id = ${userId} AND post_id = ${postId} RETURNING *`;
    return result.rowCount > 0;
}

// Giảm bộ đếm lượt like và không cho xuống dưới 0.
export async function decrementLikesCount(postId) {
    await sql`UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}`;
}
