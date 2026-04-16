import express from 'express';
import { uploadAvatarImage, uploadPostImage } from '../middleware/upload.js';
import {
    DELETE_delete_me,
    DELETE_delete_post,
    DELETE_unbookmark,
    DELETE_unfollow,
    DELETE_unlike,
    GET_bookmark_status,
    GET_bookmarks,
    GET_comments,
    GET_explore,
    GET_feed,
    GET_follow_status,
    GET_followers,
    GET_following,
    GET_health,
    GET_like_status,
    GET_notifications,
    GET_notifications_stream,
    GET_notifications_unread,
    GET_post,
    GET_preferences,
    GET_search_posts,
    GET_search_users,
    GET_topics,
    GET_user_by_id,
    GET_user_posts,
    GET_user_profile,
    GET_users_me,
    POST_auth_login,
    POST_auth_refresh,
    POST_auth_register,
    POST_bookmark,
    POST_change_password,
    POST_create_comment,
    POST_create_post,
    POST_follow,
    POST_like,
    PUT_notification_read,
    PUT_notifications_read_all,
    PUT_update_me,
    PUT_update_post,
    PUT_update_preferences
} from '../controllers/api.controller.js';

const router = express.Router();

// GET routes
router.get('/health', GET_health);
router.get('/api/v1/health', GET_health);
router.get('/api/v1/topics/', GET_topics);
router.get('/api/v1/posts/feed', GET_feed);
router.get('/api/v1/posts/explore', GET_explore);
router.get('/api/v1/posts/search', GET_search_posts);
router.get('/api/v1/posts/:id/comments/', (req, res) =>
    GET_comments(req, res, req.params.id)
);
router.get('/api/v1/posts/:id', (req, res) =>
    GET_post(req, res, req.params.id)
);
router.get('/api/v1/users/me', GET_users_me);
router.get('/api/v1/users/search', GET_search_users);
router.get('/api/v1/users/:id/profile', (req, res) =>
    GET_user_profile(req, res, req.params.id)
);
router.get('/api/v1/users/:id/posts/', (req, res) =>
    GET_user_posts(req, res, req.params.id)
);
router.get('/api/v1/users/:id', (req, res) =>
    GET_user_by_id(req, res, req.params.id)
);
router.get('/api/v1/follows/users/:id/followers/', (req, res) =>
    GET_followers(req, res, req.params.id)
);
router.get('/api/v1/follows/users/:id/following/', (req, res) =>
    GET_following(req, res, req.params.id)
);
router.get('/api/v1/follows/users/:id/status/', (req, res) =>
    GET_follow_status(req, res, req.params.id)
);
router.get('/api/v1/preferences/users/me/preferences', GET_preferences);
router.get('/api/v1/likes/posts/:id/status/', (req, res) =>
    GET_like_status(req, res, req.params.id)
);
router.get('/api/v1/notifications/', GET_notifications);
router.get('/api/v1/notifications/unread-count', GET_notifications_unread);
router.get('/api/v1/notifications/stream', GET_notifications_stream);
router.get('/api/v1/bookmarks/', GET_bookmarks);
router.get('/api/v1/bookmarks/posts/:id/status', (req, res) =>
    GET_bookmark_status(req, res, req.params.id)
);

// POST routes
router.post('/api/v1/auth/login', POST_auth_login);
router.post('/api/v1/auth/register', POST_auth_register);
router.post('/api/v1/auth/refresh', POST_auth_refresh);
router.post('/api/v1/posts/', uploadPostImage, POST_create_post);
router.post('/api/v1/posts/:id/comments/', (req, res) =>
    POST_create_comment(req, res, req.params.id)
);
router.post('/api/v1/users/me/change-password', POST_change_password);
router.post('/api/v1/likes/posts/:id/like/', (req, res) =>
    POST_like(req, res, req.params.id)
);
router.post('/api/v1/follows/users/:id/follow/', (req, res) =>
    POST_follow(req, res, req.params.id)
);
router.post('/api/v1/bookmarks/posts/:id/', (req, res) =>
    POST_bookmark(req, res, req.params.id)
);

// PUT routes
router.put('/api/v1/posts/:id', uploadPostImage, (req, res) =>
    PUT_update_post(req, res, req.params.id)
);
router.put('/api/v1/users/me', uploadAvatarImage, PUT_update_me);
router.put('/api/v1/preferences/users/me/preferences', PUT_update_preferences);
router.put('/api/v1/notifications/read-all', PUT_notifications_read_all);
router.put('/api/v1/notifications/:id/read', (req, res) =>
    PUT_notification_read(req, res, req.params.id)
);

// DELETE routes
router.delete('/api/v1/posts/:id', (req, res) =>
    DELETE_delete_post(req, res, req.params.id)
);
router.delete('/api/v1/likes/posts/:id/like/', (req, res) =>
    DELETE_unlike(req, res, req.params.id)
);
router.delete('/api/v1/follows/users/:id/follow/', (req, res) =>
    DELETE_unfollow(req, res, req.params.id)
);
router.delete('/api/v1/users/me', DELETE_delete_me);
router.delete('/api/v1/bookmarks/posts/:id/', (req, res) =>
    DELETE_unbookmark(req, res, req.params.id)
);

export default router;
