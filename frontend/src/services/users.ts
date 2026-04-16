import { api } from '../lib/api';
import type {
    User,
    UserProfile,
    FollowStatus,
    PreferenceWithTopics,
    PostWithScore
} from './types';

export interface SearchUserResult {
    id: number;
    username: string;
    email: string;
    avatar_url?: string;
    created_at: string;
}

export interface PaginatedUsers {
    items: User[];
    next_cursor: string | null;
}

export interface Notification {
    id: number;
    user_id: number;
    type: 'like' | 'comment' | 'follow' | 'mention';
    data: {
        actor_username?: string;
        actor_id?: number;
        post_id?: number;
        comment_id?: number;
        message?: string;
    };
    is_read: boolean;
    created_at: string;
}

export interface NotificationsResponse {
    notifications: Notification[];
    next_cursor: string | null;
}

export interface UnreadCountResponse {
    count: number;
}

export interface Bookmark {
    post: import('./types').Post;
}

export const usersApi = {
    getUser: async (userId: number): Promise<User> => {
        const res = await api.get<User>(`/users/${userId}`);
        return res.data;
    },

    getUserProfile: async (userId: number): Promise<UserProfile> => {
        const res = await api.get<UserProfile>(`/users/${userId}/profile`);
        return res.data;
    },

    updateMe: async (data: {
        username: string;
        date_of_birth?: string | null;
        avatar_url?: string | null;
        avatarFile?: File | null;
    }): Promise<User> => {
        const formData = new FormData();
        formData.append('username', data.username);

        if (data.date_of_birth) {
            formData.append('date_of_birth', data.date_of_birth);
        }

        if (data.avatar_url) {
            formData.append('avatar_url', data.avatar_url);
        }

        if (data.avatarFile) {
            formData.append('avatar', data.avatarFile);
        }

        const res = await api.put<User>('/users/me', formData);
        return res.data;
    },

    followUser: async (userId: number): Promise<FollowStatus> => {
        const res = await api.post<FollowStatus>(
            `/follows/users/${userId}/follow/`
        );
        return res.data;
    },

    unfollowUser: async (userId: number): Promise<FollowStatus> => {
        const res = await api.delete<FollowStatus>(
            `/follows/users/${userId}/follow/`
        );
        return res.data;
    },

    getPreferences: async (): Promise<PreferenceWithTopics> => {
        const res = await api.get<PreferenceWithTopics>(
            '/preferences/users/me/preferences'
        );
        return res.data;
    },

    updatePreferences: async (
        topicIds: number[]
    ): Promise<PreferenceWithTopics> => {
        const res = await api.put<PreferenceWithTopics>(
            '/preferences/users/me/preferences',
            { topic_ids: topicIds }
        );
        return res.data;
    },

    searchUsers: async (query: string): Promise<SearchUserResult[]> => {
        const res = await api.get<SearchUserResult[]>('/users/search', {
            params: { q: query }
        });
        return res.data;
    },

    getFollowers: async (
        userId: number,
        cursor?: string,
        limit = 20
    ): Promise<PaginatedUsers> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<PaginatedUsers>(
            `/follows/users/${userId}/followers/`,
            { params }
        );
        return res.data;
    },

    getFollowing: async (
        userId: number,
        cursor?: string,
        limit = 20
    ): Promise<PaginatedUsers> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<PaginatedUsers>(
            `/follows/users/${userId}/following/`,
            { params }
        );
        return res.data;
    },

    changePassword: async (
        currentPassword: string,
        newPassword: string
    ): Promise<{ success: boolean }> => {
        const res = await api.post<{ success: boolean }>(
            '/users/me/change-password',
            {
                current_password: currentPassword,
                new_password: newPassword
            }
        );
        return res.data;
    },

    deleteAccount: async (): Promise<{ success: boolean }> => {
        const res = await api.delete<{ success: boolean }>('/users/me');
        return res.data;
    },

    // Notifications
    getNotifications: async (
        cursor?: string,
        limit = 20
    ): Promise<NotificationsResponse> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<NotificationsResponse>('/notifications/', {
            params
        });
        return res.data;
    },

    getUnreadCount: async (): Promise<UnreadCountResponse> => {
        const res = await api.get<UnreadCountResponse>(
            '/notifications/unread-count'
        );
        return res.data;
    },

    markNotificationRead: async (id: number): Promise<void> => {
        await api.put(`/notifications/${id}/read`);
    },

    markAllNotificationsRead: async (): Promise<void> => {
        await api.put('/notifications/read-all');
    },

    // Bookmarks
    bookmarkPost: async (postId: number): Promise<void> => {
        await api.post(`/bookmarks/posts/${postId}/`);
    },

    unbookmarkPost: async (postId: number): Promise<void> => {
        await api.delete(`/bookmarks/posts/${postId}/`);
    },

    getBookmarks: async (
        cursor?: string,
        limit = 20
    ): Promise<{
        posts: import('./types').Post[];
        next_cursor: string | null;
    }> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<{
            posts: import('./types').Post[];
            next_cursor: string | null;
        }>('/bookmarks/', { params });
        return res.data;
    },

    // User posts
    getUserPosts: async (
        userId: number,
        cursor?: string,
        limit = 20
    ): Promise<{ items: PostWithScore[]; next_cursor: string | null }> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<{
            items: PostWithScore[];
            next_cursor: string | null;
        }>(`/users/${userId}/posts/`, { params });
        return res.data;
    },

    // Follow status check
    getFollowStatus: async (userId: number): Promise<FollowStatus> => {
        const res = await api.get<FollowStatus>(
            `/follows/users/${userId}/status/`
        );
        return res.data;
    }
};
