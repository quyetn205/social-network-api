import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../../services/posts'
import { bookmarksApi } from '../../services/bookmarks'
import type { PostWithScore, Topic } from '../../services/types'
import Avatar from '../../components/ui/Avatar'
import TopicBadge from '../../components/ui/TopicBadge'
import TopicSelector from '../../components/ui/TopicSelector'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

interface PostCardProps {
  post: PostWithScore
}

function timeAgo(dateStr: string) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s trước`
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`
  return `${Math.floor(diff / 86400)}d trước`
}

export default function PostCard({ post }: PostCardProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.likes_count)
  const [bookmarked, setBookmarked] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content)
  const [editTopics, setEditTopics] = useState<number[]>(post.topics.map((t: Topic) => t.id))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isOwner = user?.id === post.author_id

  const likeMutation = useMutation({
    mutationFn: () => liked ? postsApi.unlikePost(post.id) : postsApi.likePost(post.id),
    onMutate: () => {
      setLiked(!liked)
      setLikeCount((c: number) => c + (liked ? -1 : 1))
    },
    onError: () => {
      setLiked(liked)
      setLikeCount(likeCount)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const editMutation = useMutation({
    mutationFn: () => postsApi.updatePost(post.id, editContent, editTopics),
    onSuccess: (updated) => {
      queryClient.setQueryData(['feed'], (old: PostWithScore[] | undefined) =>
        old?.map((p: PostWithScore) => p.id === post.id ? { ...p, ...(updated as PostWithScore) } : p)
      )
      queryClient.setQueryData(['post', String(post.id)], updated)
      setEditing(false)
      showToast('Đã cập nhật bài viết', 'success')
    },
    onError: () => {
      showToast('Cập nhật thất bại', 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.deletePost(post.id),
    onSuccess: () => {
      queryClient.setQueryData(['feed'], (old: PostWithScore[] | undefined) =>
        old?.filter(p => p.id !== post.id)
      )
      showToast('Đã xóa bài viết', 'success')
    },
    onError: () => {
      showToast('Xóa thất bại', 'error')
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: () => bookmarked ? bookmarksApi.unbookmark(post.id) : bookmarksApi.bookmark(post.id),
    onMutate: () => {
      setBookmarked(!bookmarked)
    },
    onError: () => {
      setBookmarked(bookmarked)
      showToast('Không thể lưu bài viết', 'error')
    },
  })

  if (editing) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
        <textarea
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          className="w-full border border-gray-200 dark:border-dark-border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text"
          rows={4}
        />
        <TopicSelector selected={editTopics} onChange={setEditTopics} />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-border"
          >
            Hủy
          </button>
          <button
            onClick={() => editMutation.mutate()}
            disabled={editMutation.isPending || !editContent.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {editMutation.isPending ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        {post.author && (
          <Link to={`/profile/${post.author.id}`}>
            <Avatar username={post.author.username} avatarUrl={post.author.avatar_url} />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          {post.author && (
            <Link to={`/profile/${post.author.id}`} className="font-semibold text-gray-900 dark:text-dark-text hover:text-blue-500">
              {post.author.username}
            </Link>
          )}
          <div className="text-xs text-gray-400 dark:text-dark-muted">{timeAgo(post.created_at)}</div>
        </div>
        {post.feed_score > 0 && (
          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full">
            {post.feed_score === 3 ? '⭐ For You' : post.feed_score === 2 ? '🏷️ Phù hợp' : '👥 Follow'}
          </span>
        )}
        {isOwner && (
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-gray-400 dark:text-dark-muted hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              title="Sửa"
            >
              ✏️
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                >
                  Xóa?
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded text-xs text-gray-500 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-border"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg text-gray-400 dark:text-dark-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Xóa"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <Link to={`/posts/${post.id}`} className="block">
        <p className="text-gray-800 dark:text-dark-text whitespace-pre-wrap break-words">{post.content}</p>
      </Link>

      {/* Topics */}
      {post.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.topics.map((t: Topic) => (
            <TopicBadge key={t.id} topic={t} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1 border-t border-gray-100 dark:border-dark-border">
        <button
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            liked ? 'text-red-500' : 'text-gray-500 dark:text-dark-muted hover:text-red-400'
          }`}
        >
          <span>{liked ? '❤️' : '🤍'}</span>
          <span>{likeCount}</span>
        </button>

        <Link
          to={`/posts/${post.id}`}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-dark-muted hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
        >
          <span>💬</span>
          <span>{post.comments_count}</span>
        </Link>

        <button
          onClick={() => user && bookmarkMutation.mutate()}
          disabled={!user || bookmarkMutation.isPending}
          className={`ml-auto flex items-center gap-1.5 text-sm transition-colors ${
            bookmarked ? 'text-yellow-500' : 'text-gray-500 dark:text-dark-muted hover:text-yellow-400'
          }`}
          title={bookmarked ? 'Bỏ lưu' : 'Lưu bài viết'}
        >
          <span>{bookmarked ? '🔖' : '💾'}</span>
        </button>
      </div>
    </div>
  )
}
