import { api } from '../lib/api';

export interface NotificationData {
    actor_username?: string;
    actor_id?: number;
    post_id?: number;
    comment_id?: number;
    message?: string;
}

export interface Notification {
    id: number;
    user_id: number;
    type: 'like' | 'comment' | 'follow' | 'mention';
    data: NotificationData;
    actor_avatar_url?: string;
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

// Chuẩn hóa dữ liệu thông báo từ API.
function parseNotificationData(rawData: unknown): NotificationData {
    let data: Record<string, unknown> = {};

    if (typeof rawData === 'string') {
        try {
            const parsed = JSON.parse(rawData);
            if (parsed && typeof parsed === 'object')
                data = parsed as Record<string, unknown>;
        } catch {
            data = {};
        }
    } else if (rawData && typeof rawData === 'object') {
        data = rawData as Record<string, unknown>;
    }

    return {
        actor_username:
            (data.actor_username as string | undefined) ||
            (data.actorUsername as string | undefined),
        actor_id:
            (data.actor_id as number | undefined) ??
            (data.actorId as number | undefined),
        post_id:
            (data.post_id as number | undefined) ??
            (data.postId as number | undefined),
        comment_id:
            (data.comment_id as number | undefined) ??
            (data.commentId as number | undefined),
        message:
            (data.message as string | undefined) ||
            (data.messageText as string | undefined)
    };
}

// Làm sạch cấu trúc thông báo trả về.
function normalizeNotification(notification: Notification): Notification {
    const data = parseNotificationData(notification.data);

    return {
        ...notification,
        data
    };
}

export const notificationsApi = {
    // Lấy danh sách thông báo.
    getNotifications: async (
        cursor?: string,
        limit = 20
    ): Promise<NotificationsResponse> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<NotificationsResponse>('/notifications/', {
            params
        });
        return {
            ...res.data,
            notifications: res.data.notifications.map(normalizeNotification)
        };
    },

    // Lấy số thông báo chưa đọc.
    getUnreadCount: async (): Promise<UnreadCountResponse> => {
        const res = await api.get<UnreadCountResponse>(
            '/notifications/unread-count'
        );
        return res.data;
    },

    // Đánh dấu một thông báo đã đọc.
    markRead: async (id: number): Promise<void> => {
        await api.put(`/notifications/${id}/read`);
    },

    // Đánh dấu tất cả thông báo đã đọc.
    markAllRead: async (): Promise<void> => {
        await api.put('/notifications/read-all');
    }
};
