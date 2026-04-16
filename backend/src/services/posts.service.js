import {
    createNotification,
    created,
    err,
    getUserFromToken,
    noContent,
    ok
} from '../controllers/shared.controller.js';
import {
    buildPublicUploadUrl,
    deleteUploadedImageUrl,
    deleteUploadedFile
} from '../middleware/upload.js';
import {
    decrementLikesCount,
    deleteLike,
    deletePost,
    incrementCommentsCount,
    incrementLikesCount,
    insertComment,
    insertLike,
    insertPost,
    insertPostTopics,
    replacePostTopics,
    selectComments,
    selectExplorePosts,
    selectFeedPosts,
    selectFollowingIds,
    selectLikeStatus,
    selectPostAuthor,
    selectPostById,
    selectPostTopicsForPost,
    selectPreferenceTopicIds,
    selectSearchPosts,
    selectTopicsMap,
    updatePostContent,
    updatePostDetails
} from '../repositories/posts.repository.js';

function mapPost(post, topicsMap, extra = {}) {
    return {
        id: post.id,
        content: post.content,
        image_url: post.image_url || null,
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
        ...extra
    };
}

function mapComment(comment) {
    return {
        id: comment.id,
        content: comment.content,
        post_id: comment.post_id,
        author_id: comment.author_id,
        parent_id: comment.parent_id,
        created_at: comment.created_at,
        author: {
            id: comment['author.id'],
            username: comment['author.username'],
            email: comment['author.email'],
            avatar_url: comment['author.avatar_url'],
            created_at: comment['author.created_at']
        }
    };
}

function parseTopicIds(value) {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) {
        return value
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item));
    }
    if (typeof value === 'string') {
        try {
            return parseTopicIds(JSON.parse(value));
        } catch {
            return value
                .split(',')
                .map((item) => Number(item.trim()))
                .filter((item) => Number.isInteger(item));
        }
    }
    return [];
}

export async function GET_feed(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    const preferredTopicIds = await selectPreferenceTopicIds(user.id);
    const followingIds = await selectFollowingIds(user.id);
    const topicsMap = await selectTopicsMap();
    const { rows: posts, hasMore } = await selectFeedPosts(cursor, limit);

    const items = posts.map((post) => {
        const postTopicIds = (topicsMap[post.id] || []).map(
            (topic) => topic.id
        );
        let score = 0;
        if (followingIds.includes(post.author_id)) score += 1;
        if (postTopicIds.some((id) => preferredTopicIds.includes(id))) {
            score += 2;
        }
        return mapPost(post, topicsMap, { feed_score: score });
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

export async function GET_search_posts(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const q = req.query.q || '';
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    const topicsMap = await selectTopicsMap();
    const { rows: posts, hasMore } = await selectSearchPosts(q, cursor, limit);
    const items = posts.map((post) => mapPost(post, topicsMap));

    const next_cursor =
        hasMore && items.length > 0 ? items[items.length - 1].created_at : null;
    return ok(res, { items, next_cursor });
}

export async function GET_explore(req, res) {
    await getUserFromToken(req);

    const topicId = req.query.topic_id;
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '10', 10);

    const topicsMap = await selectTopicsMap();
    const { rows: posts, hasMore } = await selectExplorePosts(
        topicId,
        cursor,
        limit
    );
    const items = posts.map((post) => mapPost(post, topicsMap));

    const next_cursor =
        hasMore && items.length > 0 ? items[items.length - 1].created_at : null;
    return ok(res, { items, next_cursor });
}

export async function POST_create_post(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { content, topic_ids } = body;
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const normalizedTopicIds = parseTopicIds(topic_ids);
    const imageUrl = req.file
        ? buildPublicUploadUrl(req, req.file.filename)
        : null;

    if (normalizedContent.length === 0 && !imageUrl) {
        await deleteUploadedFile(req.file?.path);
        return err(res, 400, 'Content or image is required');
    }
    if (normalizedContent.length > 5000) {
        await deleteUploadedFile(req.file?.path);
        return err(res, 400, 'Content must not exceed 5000 characters');
    }

    let post;
    try {
        post = await insertPost(normalizedContent, user.id, imageUrl);
        if (normalizedTopicIds.length) {
            await insertPostTopics(post.id, normalizedTopicIds);
        }
    } catch (error) {
        await deleteUploadedFile(req.file?.path);
        throw error;
    }

    const topicsRows = await selectPostTopicsForPost(post.id);
    return created(res, {
        id: post.id,
        content: post.content,
        image_url: post.image_url || null,
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

export async function PUT_update_post(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const existing = await selectPostById(postId);
    if (!existing) return err(res, 404, 'Post not found');
    if (existing.author_id !== user.id) {
        return err(res, 403, 'You are not authorized to update this post');
    }

    const body = req.body;
    const { content, topic_ids } = body;
    const removeImage =
        String(body.remove_image || '').toLowerCase() === 'true';
    const normalizedContent =
        typeof content === 'string' ? content.trim() : undefined;
    const normalizedTopicIds =
        topic_ids !== undefined ? parseTopicIds(topic_ids) : undefined;

    const previousImageUrl = existing.image_url || null;
    const nextImageUrl = req.file
        ? buildPublicUploadUrl(req, req.file.filename)
        : removeImage
          ? null
          : previousImageUrl;
    const contentValue =
        content !== undefined ? (normalizedContent ?? '') : null;

    if (
        content !== undefined &&
        (typeof content !== 'string' || normalizedContent.length > 5000)
    ) {
        await deleteUploadedFile(req.file?.path);
        return err(res, 400, 'Content must not exceed 5000 characters');
    }

    const finalContent =
        normalizedContent !== undefined ? normalizedContent : existing.content;
    if (finalContent.length === 0 && !nextImageUrl) {
        await deleteUploadedFile(req.file?.path);
        return err(res, 400, 'Content or image is required');
    }

    let post;
    try {
        if (content !== undefined || nextImageUrl !== previousImageUrl) {
            post = await updatePostDetails(postId, contentValue, nextImageUrl);
        } else {
            post = existing;
        }
        if (normalizedTopicIds !== undefined) {
            await replacePostTopics(postId, normalizedTopicIds);
        }
    } catch (error) {
        await deleteUploadedFile(req.file?.path);
        throw error;
    }

    if (previousImageUrl && previousImageUrl !== nextImageUrl) {
        await deleteUploadedImageUrl(previousImageUrl);
    }

    const topicsRows = await selectPostTopicsForPost(postId);
    return ok(res, {
        id: post.id,
        content: post.content,
        image_url: post.image_url || null,
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

export async function DELETE_delete_post(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const existing = await selectPostById(postId);
    if (!existing) return err(res, 404, 'Post not found');
    if (existing.author_id !== user.id) {
        return err(res, 403, 'You are not authorized to delete this post');
    }

    await deleteUploadedImageUrl(existing.image_url || null);
    await deletePost(postId);
    return noContent(res);
}

export async function GET_post(req, res, id) {
    await getUserFromToken(req);

    const post = await selectPostById(id);
    if (!post) return err(res, 404, 'Post not found');

    const topicsRows = await selectPostTopicsForPost(id);
    return ok(res, {
        id: post.id,
        content: post.content,
        image_url: post.image_url || null,
        author_id: post.author_id,
        created_at: post.created_at,
        updated_at: post.updated_at,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        topics: topicsRows,
        author: {
            id: post['author.id'],
            username: post['author.username'],
            email: post['author.email'],
            date_of_birth: post['author.date_of_birth'],
            is_admin: post['author.is_admin'],
            created_at: post['author.created_at']
        }
    });
}

export async function GET_comments(req, res, postId) {
    await getUserFromToken(req);

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);
    const { rows: comments, hasMore } = await selectComments(
        postId,
        cursor,
        limit
    );
    const items = comments.map(mapComment);
    const next_cursor =
        hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;
    return ok(res, { comments: items, next_cursor });
}

export async function POST_create_comment(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const post = await selectPostAuthor(postId);
    if (!post) return err(res, 404, 'Post not found');

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

    const comment = await insertComment(content, postId, user.id, parent_id);
    await incrementCommentsCount(postId);

    if (post.author_id !== user.id) {
        await createNotification(
            post.author_id,
            'comment',
            {
                actor_id: user.id,
                actor_username: user.username,
                post_id: Number(postId)
            },
            user.avatar_url
        );
    }

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

export async function GET_like_status(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    const liked = await selectLikeStatus(user.id, postId);
    return ok(res, { liked });
}

export async function POST_like(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const post = await selectPostAuthor(postId);
    if (!post) return err(res, 404, 'Post not found');

    try {
        await insertLike(user.id, postId);
        await incrementLikesCount(postId);
        if (post.author_id !== user.id) {
            await createNotification(
                post.author_id,
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
    } catch (error) {
        if (error.code === '23505') return err(res, 400, 'Already liked');
        throw error;
    }
}

export async function DELETE_unlike(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const removed = await deleteLike(user.id, postId);
    if (!removed) return err(res, 404, 'Like not found');
    await decrementLikesCount(postId);
    return ok(res, { liked: false });
}
