import {
    deleteBookmark,
    insertBookmark,
    selectBookmarkStatus,
    selectBookmarkedPosts,
    selectPostExists,
    selectTopicsMap
} from '../repositories/bookmarks.repository.js';

function mapBookmarkPost(post, topicsMap) {
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
        }
    };
}

export async function listBookmarksForUser(userId, cursor, limit) {
    const { rows, hasMore } = await selectBookmarkedPosts(
        userId,
        cursor,
        limit
    );
    const topicsMap = await selectTopicsMap();
    const posts = rows.map((post) => mapBookmarkPost(post, topicsMap));
    const next_cursor =
        hasMore && posts.length > 0
            ? String(rows[rows.length - 1].bookmarked_at)
            : null;
    return { posts, next_cursor };
}

export async function getBookmarkStatusForUser(userId, postId) {
    return await selectBookmarkStatus(userId, postId);
}

export async function createBookmarkForUser(userId, postId) {
    const exists = await selectPostExists(postId);
    if (!exists) return { found: false };
    try {
        await insertBookmark(userId, postId);
        return { found: true, bookmarked: true };
    } catch (error) {
        if (error.code === '23505') return { found: true, bookmarked: true };
        throw error;
    }
}

export async function removeBookmarkForUser(userId, postId) {
    const removed = await deleteBookmark(userId, postId);
    return { bookmarked: false, removed };
}
