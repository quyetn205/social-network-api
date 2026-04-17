import bcrypt from 'bcryptjs';
import {
    extractStoredUploadName,
    resolvePublicUploadUrl
} from '../middleware/upload.js';
import { err, getUserFromToken, ok } from '../controllers/shared.controller.js';
import {
    countFollowers,
    countFollowing,
    countPosts,
    deleteUserById,
    searchUsers,
    selectCurrentUser,
    selectPostTopicsMap,
    selectPublicUserById,
    selectUserPosts,
    updateMe,
    updatePassword,
    usernameTaken
} from '../repositories/users.repository.js';
import { selectFollowingIds } from '../repositories/posts.repository.js';

// Lấy thông tin người dùng hiện tại.
export async function GET_users_me(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    return ok(res, {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: resolvePublicUploadUrl(req, user.avatar_url || ''),
        date_of_birth: user.date_of_birth,
        is_admin: user.is_admin,
        created_at: user.created_at
    });
}

// Cập nhật hồ sơ của người dùng hiện tại.
export async function PUT_update_me(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { username, date_of_birth, avatar_url } = body;
    const uploadedAvatarName = req.file
        ? req.file.filename
        : avatar_url !== undefined
          ? extractStoredUploadName(avatar_url)
          : undefined;

    if (username !== undefined) {
        if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
            return err(
                res,
                400,
                'Username must be 4–20 characters: letters, numbers, and underscore only'
            );
        }
        if (await usernameTaken(username, user.id)) {
            return err(res, 400, 'Username already taken');
        }
    }

    const updated = await updateMe(user.id, {
        username,
        date_of_birth,
        avatar_url: uploadedAvatarName
    });
    return ok(res, {
        ...updated,
        avatar_url: resolvePublicUploadUrl(req, updated?.avatar_url || '')
    });
}

// Xóa tài khoản hiện tại.
export async function DELETE_delete_me(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');
    await deleteUserById(user.id);
    return ok(res, { success: true });
}

// Lấy người dùng theo id.
export async function GET_user_by_id(req, res, id) {
    const user = await selectPublicUserById(id);
    if (!user) return err(res, 404, 'User not found');
    return ok(res, {
        ...user,
        avatar_url: resolvePublicUploadUrl(req, user.avatar_url || '')
    });
}

// Lấy hồ sơ công khai của người dùng.
export async function GET_user_profile(req, res, id) {
    const user = await selectPublicUserById(id);
    if (!user) return err(res, 404, 'User not found');

    const [followers_count, following_count, posts_count] = await Promise.all([
        countFollowers(id),
        countFollowing(id),
        countPosts(id)
    ]);

    return ok(res, {
        ...user,
        avatar_url: resolvePublicUploadUrl(req, user.avatar_url || ''),
        followers_count,
        following_count,
        posts_count
    });
}

// Lấy bài viết của người dùng.
export async function GET_user_posts(req, res, userId) {
    const viewer = await getUserFromToken(req);
    if (!viewer) return err(res, 401, 'Could not validate credentials');

    const user = await selectPublicUserById(userId);
    if (!user) return err(res, 404, 'User not found');

    const viewerFollowingIds =
        Number(viewer.id) === Number(userId)
            ? []
            : await selectFollowingIds(viewer.id);
    const authorFollowingIds =
        Number(viewer.id) === Number(userId)
            ? []
            : await selectFollowingIds(userId);

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    const { rows: userPosts, hasMore } = await selectUserPosts(
        userId,
        cursor,
        limit
    );
    const topicsMap = await selectPostTopicsMap();
    const items = userPosts
        .filter((post) => {
            const visibility = (post.visibility || 'public').toLowerCase();
            if (
                Number(viewer.id) === Number(userId) ||
                post.author_id === viewer.id
            ) {
                return true;
            }
            if (visibility === 'public') return true;
            if (visibility === 'private') return false;
            if (visibility === 'friend') {
                return (
                    viewerFollowingIds.includes(post.author_id) &&
                    authorFollowingIds.includes(viewer.id)
                );
            }
            return true;
        })
        .map((post) => ({
            id: post.id,
            content: post.content,
            visibility: post.visibility || 'public',
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
                avatar_url: resolvePublicUploadUrl(
                    req,
                    post['author.avatar_url']
                ),
                date_of_birth: post['author.date_of_birth'],
                is_admin: post['author.is_admin'],
                created_at: post['author.created_at']
            }
        }));

    return ok(res, {
        items,
        next_cursor:
            hasMore && items.length > 0
                ? String(items[items.length - 1].created_at)
                : null
    });
}

// Tìm người dùng.
export async function GET_search_users(req, res) {
    const me = await getUserFromToken(req);
    if (!me) return err(res, 401, 'Could not validate credentials');

    const q = req.query.q || '';
    if (!q) return ok(res, []);

    const rows = await searchUsers(q);
    return ok(res, rows);
}

// Đổi mật khẩu.
export async function POST_change_password(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { current_password, new_password } = body;
    if (!current_password || !new_password) {
        return err(res, 400, 'current_password and new_password are required');
    }

    const current = await selectCurrentUser(user.id);
    const valid = await bcrypt.compare(
        current_password,
        current.hashed_password
    );
    if (!valid) return err(res, 400, 'Current password is incorrect');

    const hashed = await bcrypt.hash(new_password, 10);
    await updatePassword(user.id, hashed);
    return ok(res, { success: true });
}
