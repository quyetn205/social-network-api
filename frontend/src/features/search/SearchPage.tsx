import { useState, useCallback, useEffect} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { postsApi } from '../../services/posts'
import { usersApi } from '../../services/users'
import { PostCardSkeleton, UserListSkeleton } from '../../components/ui/Skeleton'
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll'
import Avatar from '../../components/ui/Avatar'
import type { Post } from '../../services/types'

type Tab = 'posts' | 'users'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('posts')
  const [postCursor, setPostCursor] = useState<string | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [hasMorePosts, setHasMorePosts] = useState(true)
  const [isLoadingPosts, setIsLoadingPosts] = useState(false)
  const [_searchTrigger, setSearchTrigger] = useState(0)

  const handleSearchInput = (value: string) => {
    setQuery(value)
    if (!value.trim()) {
      setDebouncedQuery('')
      setPosts([])
      setPostCursor(null)
      setHasMorePosts(true)
    }
  }

  const handleSearchSubmit = () => {
    const trimmed = query.trim()
    setDebouncedQuery(trimmed)
    setPosts([])
    setPostCursor(null)
    setHasMorePosts(true)
    setSearchTrigger(prev => prev + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit()
    }
  }

  // ── Posts search ──
  const {
    data: initialPostsData,
    isLoading: isLoadingPostsInitial,
  } = useQuery({
    queryKey: ['search', 'posts', debouncedQuery, 0],
    queryFn: () => postsApi.searchPosts(debouncedQuery, undefined, 20),
    enabled: debouncedQuery.length > 0 && postCursor === null,
  })

  // Đổ dữ liệu ban đầu vào state posts
  useEffect(() => {
    if (initialPostsData) {
      setPosts(initialPostsData.items);
      setPostCursor(initialPostsData.next_cursor);
      setHasMorePosts(initialPostsData.next_cursor !== null);
    }
  }, [initialPostsData])

  // Load more posts
  const loadMorePosts = useCallback(async () => {
    if (!hasMorePosts || !debouncedQuery || isLoadingPosts) return
    setIsLoadingPosts(true)
    try {
      const data = await postsApi.searchPosts(debouncedQuery, postCursor ?? undefined, 20)
      setPosts(prev => [...prev, ...data.items])
      setPostCursor(data.next_cursor)
      setHasMorePosts(data.next_cursor !== null)
    } finally {
      setIsLoadingPosts(false)
    }
  }, [debouncedQuery, postCursor, hasMorePosts, isLoadingPosts])

  const lastPostRef = useInfiniteScroll({
    hasMore: hasMorePosts && !!debouncedQuery,
    loading: isLoadingPosts,
    onLoadMore: loadMorePosts,
  })

  // ── Users search ──
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['search', 'users', debouncedQuery],
    queryFn: () => usersApi.searchUsers(debouncedQuery),
    enabled: debouncedQuery.length > 0 && activeTab === 'users',
  })

  const showInitial = debouncedQuery.length === 0
  const showNoResults = debouncedQuery.length > 0 && !isLoadingPostsInitial && activeTab === 'posts' && posts.length === 0
  const showNoUsers = debouncedQuery.length > 0 && !isLoadingUsers && activeTab === 'users' && (users?.length ?? 0) === 0

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Header */}
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Tìm kiếm</h1>

      {/* Search input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => handleSearchInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tìm kiếm bài viết hoặc người dùng..."
          className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
        <button
          onClick={handleSearchSubmit}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          🔍
        </button>
      </div>

      {/* Tabs */}
      {debouncedQuery.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'posts'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Bài viết
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Người dùng
          </button>
        </div>
      )}

      {/* Initial state */}
      {showInitial && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">🔍</p>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Tìm kiếm bài viết hoặc người dùng</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Nhấn Enter hoặc nút 🔍 để tìm kiếm</p>
        </div>
      )}

      {/* Posts tab */}
      {activeTab === 'posts' && debouncedQuery.length > 0 && (
        <div className="space-y-4">
          {/* Initial loading */}
          {isLoadingPostsInitial && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <PostCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div className="text-center py-12">
              <p className="text-5xl mb-3">📭</p>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Không tìm thấy bài viết nào</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Thử từ khóa khác</p>
            </div>
          )}

          {/* Posts list */}
          {!isLoadingPostsInitial && posts.length > 0 && (
            <div className="space-y-4">
              {posts.map((post, idx) => (
                <div
                  key={post.id}
                  ref={idx === posts.length - 1 ? lastPostRef : undefined}
                >
                  <PostCardSimple post={post} />
                </div>
              ))}
            </div>
          )}

          {/* Loading more */}
          {isLoadingPosts && posts.length > 0 && (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <PostCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* End of list */}
          {!hasMorePosts && posts.length > 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
              Đã hiển thị tất cả kết quả
            </p>
          )}
        </div>
      )}

      {/* Users tab */}
      {activeTab === 'users' && debouncedQuery.length > 0 && (
        <div className="space-y-3">
          {isLoadingUsers && (
            <UserListSkeleton count={6} />
          )}

          {showNoUsers && (
            <div className="text-center py-12">
              <p className="text-5xl mb-3">👤</p>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Không tìm thấy người dùng nào</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Thử từ khóa khác</p>
            </div>
          )}

          {users && users.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {users.map(u => (
                <Link
                  key={u.id}
                  to={`/profile/${u.id}`}
                  className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <Avatar username={u.username} avatarUrl={(u as any).avatar_url} size="sm" />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{u.username}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.email}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Simple post card for search results (inline, no full PostCard import)
function PostCardSimple({ post }: { post: Post }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center gap-3">
        {post.author && (
          <Link to={`/profile/${post.author.id}`}>
            <Avatar username={post.author.username} avatarUrl={post.author.avatar_url} size="sm" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          {post.author && (
            <Link to={`/profile/${post.author.id}`} className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-500 text-sm">
              {post.author.username}
            </Link>
          )}
        </div>
        <Link to={`/posts/${post.id}`} className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 shrink-0">
          Xem →
        </Link>
      </div>
      <Link to={`/posts/${post.id}`} className="block">
        <p className="text-gray-700 dark:text-gray-300 text-sm line-clamp-2">{post.content}</p>
      </Link>
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span>❤️ {post.likes_count}</span>
        <span>💬 {post.comments_count}</span>
      </div>
    </div>
  )
}