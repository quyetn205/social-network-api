import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bookmarksApi } from '../../services/bookmarks';
import { useToast } from '../../context/ToastContext';
import { PostCardSkeleton } from '../../components/ui/Skeleton';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import type { Post } from '../../services/types';
import Avatar from '../../components/ui/Avatar';
import TopicBadge from '../../components/ui/TopicBadge';

function timeAgo(dateStr: string) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return `${diff}s trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
    return `${Math.floor(diff / 86400)}d trước`;
}

interface PostCardItemProps {
    post: Post;
    onRemove: (postId: number) => void;
    isRemoving: boolean;
}

function PostCardItem({ post, onRemove, isRemoving }: PostCardItemProps) {
    return (
        <div className='bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3'>
            {/* Header */}
            <div className='flex items-center gap-3'>
                {post.author && (
                    <Link to={`/profile/${post.author.id}`}>
                        <Avatar username={post.author.username} />
                    </Link>
                )}
                <div className='flex-1 min-w-0'>
                    {post.author && (
                        <Link
                            to={`/profile/${post.author.id}`}
                            className='font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-500'
                        >
                            {post.author.username}
                        </Link>
                    )}
                    <div className='text-xs text-gray-400 dark:text-gray-500'>
                        {timeAgo(post.created_at)}
                    </div>
                </div>
                <button
                    onClick={() => onRemove(post.id)}
                    disabled={isRemoving}
                    className='text-sm text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50'
                    title='Bỏ lưu'
                >
                    💾
                </button>
            </div>

            {/* Content */}
            <Link to={`/posts/${post.id}`} className='block'>
                <p className='text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words'>
                    {post.content}
                </p>
            </Link>

            {/* Topics */}
            {post.topics.length > 0 && (
                <div className='flex flex-wrap gap-1.5'>
                    {post.topics.map((t) => (
                        <TopicBadge key={t.id} topic={t} />
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className='flex items-center gap-4 pt-1 border-t border-gray-100 dark:border-gray-700'>
                <span className='flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400'>
                    <span>❤️</span>
                    <span>{post.likes_count}</span>
                </span>
                <Link
                    to={`/posts/${post.id}`}
                    className='flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors'
                >
                    <span>💬</span>
                    <span>{post.comments_count}</span>
                </Link>
            </div>
        </div>
    );
}

export default function BookmarksPage() {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [posts, setPosts] = useState<Post[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const { data: initialData, isLoading } = useQuery({
        queryKey: ['bookmarks'],
        queryFn: () => bookmarksApi.getBookmarks(undefined, 20)
    });

    useEffect(() => {
        if (!initialData) return;
        setPosts(initialData.posts);
        setCursor(initialData.next_cursor as string | null);
        setHasMore(initialData.next_cursor !== null);
    }, [initialData]);

    const loadMore = useCallback(async () => {
        if (!hasMore || isLoadingMore || cursor === null) return;
        setIsLoadingMore(true);
        try {
            const data = await bookmarksApi.getBookmarks(
                cursor ?? undefined,
                20
            );
            setPosts((prev) => [...prev, ...data.posts]);
            setCursor(data.next_cursor);
            setHasMore(data.next_cursor !== null);
        } catch {
            showToast('Không thể tải thêm bài viết', 'error');
        } finally {
            setIsLoadingMore(false);
        }
    }, [cursor, hasMore, isLoadingMore, showToast]);

    const lastElementRef = useInfiniteScroll({
        hasMore,
        loading: isLoadingMore,
        onLoadMore: loadMore
    });

    const unbookmarkMutation = useMutation({
        mutationFn: (postId: number) => bookmarksApi.unbookmark(postId),
        onMutate: (postId) => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            showToast('Đã bỏ lưu bài viết', 'success');
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
            showToast('Không thể bỏ lưu bài viết', 'error');
        }
    });

    return (
        <div className='space-y-4 max-w-xl mx-auto'>
            {/* Header */}
            <h1 className='text-xl font-bold text-gray-800 dark:text-gray-100'>
                Bài viết đã lưu
            </h1>

            {/* Loading initial */}
            {isLoading && (
                <div className='space-y-4'>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <PostCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && posts.length === 0 && (
                <div className='text-center py-12'>
                    <p className='text-5xl mb-3'>💾</p>
                    <p className='text-gray-500 dark:text-gray-400 font-medium'>
                        Chưa có bài viết nào được lưu
                    </p>
                    <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                        Nhấn 💾 trên bài viết để lưu lại
                    </p>
                    <Link
                        to='/feed'
                        className='inline-block mt-4 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
                    >
                        ← Quay lại bảng tin
                    </Link>
                </div>
            )}

            {/* Post list */}
            {!isLoading && (
                <div className='space-y-4'>
                    {posts.map((post, idx) => (
                        <div
                            key={post.id}
                            ref={
                                idx === posts.length - 1
                                    ? lastElementRef
                                    : undefined
                            }
                        >
                            <PostCardItem
                                post={post}
                                onRemove={(id) => unbookmarkMutation.mutate(id)}
                                isRemoving={unbookmarkMutation.isPending}
                            />
                        </div>
                    ))}

                    {/* Loading more */}
                    {isLoadingMore && (
                        <div className='space-y-4'>
                            {Array.from({ length: 2 }).map((_, i) => (
                                <PostCardSkeleton key={i} />
                            ))}
                        </div>
                    )}

                    {/* End of list */}
                    {!hasMore && posts.length > 0 && (
                        <p className='text-center text-sm text-gray-400 dark:text-gray-500 py-4'>
                            Bạn đã xem hết các bài viết đã lưu
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
