import { api } from '../lib/api'

export interface Notification {
  id: number
  user_id: number
  type: 'like' | 'comment' | 'follow' | 'mention'
  data: {
    actor_username?: string
    actor_id?: number
    post_id?: number
    comment_id?: number
    message?: string
  }
  actor_avatar_url?: string
  is_read: boolean
  created_at: string
}

export interface NotificationsResponse {
  notifications: Notification[]
  next_cursor: string | null
}

export interface UnreadCountResponse {
  count: number
}

export const notificationsApi = {
  getNotifications: async (cursor?: string, limit = 20): Promise<NotificationsResponse> => {
    const params: Record<string, string> = { limit: String(limit) }
    if (cursor !== undefined) params.cursor = cursor
    const res = await api.get<NotificationsResponse>('/notifications/', { params })
    return res.data
  },

  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    const res = await api.get<UnreadCountResponse>('/notifications/unread-count')
    return res.data
  },

  markRead: async (id: number): Promise<void> => {
    await api.put(`/notifications/${id}/read`)
  },

  markAllRead: async (): Promise<void> => {
    await api.put('/notifications/read-all')
  },
}
