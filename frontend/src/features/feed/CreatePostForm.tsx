import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../../services/posts'
import TopicSelector from '../../components/ui/TopicSelector'
import { useToast } from '../../context/ToastContext'

export default function CreatePostForm() {
  const [content, setContent] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<number[]>([])
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const createMutation = useMutation({
    mutationFn: () => postsApi.createPost(content, selectedTopics),
    onSuccess: () => {
      setContent('')
      setSelectedTopics([])
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      showToast('Bài viết đã được đăng!', 'success')
    },
    onError: () => {
      showToast('Đăng bài thất bại. Vui lòng thử lại.', 'error')
    },
  })

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Bạn đang nghĩ gì?"
        className="w-full resize-none border border-gray-200 dark:border-dark-border rounded-lg p-3 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-dark-bg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-24"
        maxLength={2000}
      />

      <TopicSelector selected={selectedTopics} onChange={setSelectedTopics} />

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-dark-muted">{content.length}/2000</span>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!content.trim() || createMutation.isPending}
          className="bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? 'Đang đăng...' : 'Đăng'}
        </button>
      </div>
    </div>
  )
}
