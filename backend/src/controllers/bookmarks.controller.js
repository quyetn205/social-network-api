import { created, err, getUserFromToken, ok } from './shared.controller.js';
import {
    createBookmarkForUser,
    getBookmarkStatusForUser,
    listBookmarksForUser,
    removeBookmarkForUser
} from '../services/bookmarks.service.js';

export async function GET_bookmarks(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit || '20', 10);

    const { posts, next_cursor } = await listBookmarksForUser(
        user.id,
        cursor,
        limit
    );
    return ok(res, { posts, next_cursor });
}

export async function GET_bookmark_status(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const bookmarked = await getBookmarkStatusForUser(user.id, postId);
    return ok(res, { bookmarked });
}

export async function POST_bookmark(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const result = await createBookmarkForUser(user.id, postId);
    if (!result.found) {
        return err(res, 404, 'Post not found');
    }
    return created(res, { bookmarked: true });
}

export async function DELETE_unbookmark(req, res, postId) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    await removeBookmarkForUser(user.id, postId);
    return ok(res, { bookmarked: false });
}
