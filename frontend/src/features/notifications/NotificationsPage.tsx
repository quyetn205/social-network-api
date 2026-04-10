import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { notificationsApi, type Notification } from '../../services/notifications'
import { useToast } from '../../context/ToastContext'
import { NotificationSkeleton } from '../../components/ui/Skeleton'
import Avatar from '../../components/ui/Avatar'
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll'

function timeAgo(dateStr: string) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s trước`
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`
  return `${Math.floor(diff / 86400)}d trước`
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'like': return '❤️'
    case 'comment': return '💬'
    case 'follow': return '👤'
    case 'mention': return '@'
    default: return '🔔'
  }
}

function getNotificationText(n: Notification) {
  const actor = n.data.actor_username || 'Ai đó'
  switch (n.type) {
    case 'like':
      return `${actor} đã thích bài viết của bạn`
    case 'comment':
      return `${actor} đã bình luận bài viết của bạn`
    case 'follow':
      return `${actor} đã theo dõi bạn`
    case 'mention':
      return `${actor} đã nhắc đến bạn`
    default:
      return 'Bạn có thông báo mới'
  }
}

function getNotificationLink(n: Notification): string {
  if (n.data.post_id) return `/posts/${n.data.post_id}`
  if (n.data.actor_id) return `/profile/${n.data.actor_id}`
  return '/notifications'
}

interface NotificationItemProps {
  notification: Notification
  onMarkRead: (id: number) => void
}

function NotificationItem({ notification: n, onMarkRead }: NotificationItemProps) {
  const link = getNotificationLink(n)

  return (
    <Link
      to={link}
      onClick={() => !n.is_read && onMarkRead(n.id)}
      className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
        n.is_read
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-70'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      }`}
    >
      {/* Avatar / Icon */}
      <div className="shrink-0">
        {n.data.actor_id && n.data.actor_username ? (
          <Link to={`/profile/${n.data.actor_id}`}>
            <Avatar username={n.data.actor_username} avatarUrl={n.actor_avatar_url} />
          </Link>
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg">
            {getNotificationIcon(n.type)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${n.is_read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'} font-medium`}>
          {getNotificationText(n)}
        </p>
        {n.data.message && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">{n.data.message}</p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
      </div>

      {/* Unread dot */}
      {!n.is_read && (
        <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-500" />
      )}
    </Link>
  )
}

export default function NotificationsPage() {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const initializedRef = useRef(false)

  const { data: initialData, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.getNotifications(undefined, 20),
    enabled: !initializedRef.current,
  })

  // Initialize notifications from query data
  if (initialData && !initializedRef.current) {
    initializedRef.current = true
    setNotifications(initialData.notifications)
    setCursor(initialData.next_cursor)
    setHasMore(initialData.next_cursor !== null)
  }

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || cursor === null) return
    setIsLoadingMore(true)
    try {
      const data = await notificationsApi.getNotifications(cursor, 20)
      setNotifications(prev => [...prev, ...data.notifications])
      setCursor(data.next_cursor)
      setHasMore(data.next_cursor !== null)
    } catch {
      showToast('Không thể tải thêm thông báo', 'error')
    } finally {
      setIsLoadingMore(false)
    }
  }, [cursor, hasMore, isLoadingMore, showToast])

  const lastElementRef = useInfiniteScroll({ hasMore, loading: isLoadingMore, onLoadMore: loadMore })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onMutate: (id) => {
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      )
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onMutate: () => {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
    onSuccess: () => {
      showToast('Đã đánh dấu tất cả là đã đọc', 'success')
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
    },
  })

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Thông báo</h1>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
          >
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {/* Loading initial */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">🔔</p>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Không có thông báo nào</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Khi có thông báo, bạn sẽ thấy ở đây</p>
        </div>
      )}

      {/* Notification list */}
      {!isLoading && (
        <div className="space-y-3">
          {notifications.map((n, idx) => (
            <div
              key={n.id}
              ref={idx === notifications.length - 1 ? lastElementRef : undefined}
            >
              <NotificationItem notification={n} onMarkRead={(id) => markReadMutation.mutate(id)} />
            </div>
          ))}

          {/* Loading more */}
          {isLoadingMore && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <NotificationSkeleton key={i} />
              ))}
            </div>
          )}

          {/* End of list */}
          {!hasMore && notifications.length > 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
              Bạn đã xem hết thông báo
            </p>
          )}
        </div>
      )}
    </div>
  )
}
