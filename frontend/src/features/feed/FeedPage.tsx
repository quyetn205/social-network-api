import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { postsApi } from '../../services/posts'
import type { PostWithScore } from '../../services/types'
import PostCard from './PostCard'
import CreatePostForm from './CreatePostForm'
import { PostCardSkeleton } from '../../components/ui/Skeleton'

const LIMIT = 20

export default function FeedPage() {
  const [posts, setPosts] = useState<PostWithScore[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)            // counter to force refetch
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const hasMoreRef = useRef(true)
  const cursorRef = useRef<string | undefined>(undefined)
  const isFetchingRef = useRef(false)

  cursorRef.current = cursor
  hasMoreRef.current = hasMore

  const { isLoading, isFetching } = useQuery({
    queryKey: ['feed', page],
    queryFn: async () => {
      if (isFetchingRef.current) return null
      isFetchingRef.current = true
      try {
        const data = await postsApi.getFeed(cursorRef.current, LIMIT)
        if (cursorRef.current === undefined) {
          setPosts(data.items)
        } else {
          setPosts(prev => [...prev, ...data.items])
        }
        setHasMore(data.next_cursor !== null)
        setCursor(data.next_cursor ?? undefined)
        return data
      } finally {
        isFetchingRef.current = false
      }
    },
    staleTime: 30_000,
  })

  // IntersectionObserver — scroll to load more
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isFetchingRef.current) {
          setPage(p => p + 1)
        }
      },
      { threshold: 0.1 }
    )
    const el = loadMoreRef.current
    if (el) observer.observe(el)
    return () => { if (el) observer.unobserve(el) }
  }, [])

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <CreatePostForm />

      {/* Initial loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && posts.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-dark-muted">
          <p className="text-4xl mb-3">📭</p>
          <p>Chưa có bài viết nào trong bảng tin.</p>
          <p className="text-sm mt-1">Hãy follow người khác hoặc đăng bài đầu tiên!</p>
        </div>
      )}

      {/* Posts */}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {/* Load more sentinel */}
      {posts.length > 0 && (
        <div ref={loadMoreRef} className="py-4 text-center">
          {isFetching && (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <PostCardSkeleton key={i} />
              ))}
            </div>
          )}
          {!hasMore && (
            <p className="text-gray-400 dark:text-dark-muted text-sm">Bạn đã xem hết bài viết 🎉</p>
          )}
        </div>
      )}
    </div>
  )
}
