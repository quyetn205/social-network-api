import { useState } from 'react'
import type { Comment } from '../../services/types'
import Avatar from '../../components/ui/Avatar'

interface CommentItemProps {
  comment: Comment
  onReply: (parentId: number, content: string) => void
}

function timeAgo(dateStr: string) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}p`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export default function CommentItem({ comment, onReply }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false)
  const [replyContent, setReplyContent] = useState('')

  const handleReply = () => {
    if (replyContent.trim()) {
      onReply(comment.id, replyContent)
      setReplyContent('')
      setShowReply(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {comment.author && <Avatar username={comment.author.username} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className="bg-gray-100 rounded-xl px-3 py-2">
            <div className="text-xs font-semibold text-gray-700">{comment.author?.username}</div>
            <p className="text-sm text-gray-800">{comment.content}</p>
          </div>
          <div className="flex items-center gap-3 mt-1 ml-1">
            <span className="text-xs text-gray-400">{timeAgo(comment.created_at)}</span>
            <button
              onClick={() => setShowReply(!showReply)}
              className="text-xs text-blue-500 hover:underline"
            >
              Trả lời
            </button>
          </div>
        </div>
      </div>

      {showReply && (
        <div className="ml-10 space-y-2">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Viết phản hồi..."
            className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={handleReply}
              className="text-xs bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600"
            >
              Gửi
            </button>
            <button
              onClick={() => setShowReply(false)}
              className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-lg hover:bg-gray-200"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
