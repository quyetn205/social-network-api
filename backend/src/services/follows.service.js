import {
    createNotification,
    created,
    err,
    getUserFromToken,
    ok
} from '../controllers/shared.controller.js';
import {
    extractStoredUploadName,
    resolvePublicUploadUrl
} from '../middleware/upload.js';
import {
    deleteFollow,
    selectFriendStatus,
    insertFollow,
    selectFollowRows,
    selectFollowStatus,
    selectUserExists
} from '../repositories/follows.repository.js';

// Xử lý follow người dùng.
export async function POST_follow(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');
    const targetUserId = Number(userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return err(res, 400, 'Invalid user id');
    }
    if (me.id === targetUserId) {
        return err(res, 400, 'Cannot follow yourself');
    }

    const exists = await selectUserExists(targetUserId);
    if (!exists) return err(res, 404, 'User not found');

    try {
        await insertFollow(me.id, targetUserId);
        await createNotification(
            targetUserId,
            'follow',
            {
                actor_id: me.id,
                actor_username: me.username
            },
            extractStoredUploadName(me.avatar_url)
        );
        return created(res, { following: true });
    } catch (error) {
        if (error.code === '23505') return ok(res, { following: true });
        throw error;
    }
}

// Xử lý bỏ follow.
export async function DELETE_unfollow(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');

    const targetUserId = Number(userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return err(res, 400, 'Invalid user id');
    }

    const removed = await deleteFollow(me.id, targetUserId);
    if (!removed) return ok(res, { following: false });
    return ok(res, { following: false });
}

// Lấy danh sách người theo dõi.
export async function GET_followers(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);
    const { rows, hasMore } = await selectFollowRows(
        userId,
        'followers',
        cursor,
        limit
    );
    const items = await Promise.all(
        rows.map(async (r) => {
            const friend =
                me.id !== Number(r.id) &&
                (await selectFriendStatus(me.id, r.id));
            return {
                id: r.id,
                username: r.username,
                email: r.email,
                avatar_url: resolvePublicUploadUrl(req, r.avatar_url),
                created_at: r.created_at,
                friend
            };
        })
    );
    const next_cursor =
        hasMore && items.length > 0
            ? String(rows[rows.length - 1].follow_created_at)
            : null;
    return ok(res, { items, next_cursor });
}

// Lấy danh sách đang theo dõi.
export async function GET_following(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);
    const { rows, hasMore } = await selectFollowRows(
        userId,
        'following',
        cursor,
        limit
    );
    const items = await Promise.all(
        rows.map(async (r) => {
            const friend =
                me.id !== Number(r.id) &&
                (await selectFriendStatus(me.id, r.id));
            return {
                id: r.id,
                username: r.username,
                email: r.email,
                avatar_url: resolvePublicUploadUrl(req, r.avatar_url),
                created_at: r.created_at,
                friend
            };
        })
    );
    const next_cursor =
        hasMore && items.length > 0
            ? String(rows[rows.length - 1].follow_created_at)
            : null;
    return ok(res, { items, next_cursor });
}

// Kiểm tra trạng thái follow.
export async function GET_follow_status(req, res, userId) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');
    const following = await selectFollowStatus(me.id, userId);
    const friend = following && (await selectFriendStatus(me.id, userId));
    return ok(res, { following, friend });
}
