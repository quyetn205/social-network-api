import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import PostCard from '../feed/PostCard';
import type { Post, Topic } from '../../services/types';
import { PostCardSkeleton } from '../../components/ui/Skeleton';

const LIMIT = 10;

// Hiển thị trang khám phá bài viết.
export default function ExplorePage() {
    const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const { data: topics } = useQuery({
        queryKey: ['topics'],
        queryFn: postsApi.getTopics
    });

    const {
        data,
        isLoading,
        isFetching,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage
    } = useInfiniteQuery({
        queryKey: ['explore', selectedTopicId],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) =>
            postsApi.explore(
                selectedTopicId ?? undefined,
                pageParam ?? undefined,
                LIMIT
            ),
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
        staleTime: 30_000
    });

    const dedupedPosts = (data?.pages ?? []).flatMap((page) => page.items);
    const allPosts: Post[] = Array.from(
        new Map(dedupedPosts.map((post) => [post.id, post])).values()
    );

    // Đổi bộ lọc chủ đề.
    const handleTopicChange = (topicId: number | null) => {
        setSelectedTopicId((prev) => (prev === topicId ? prev : topicId));
    };

    // IntersectionObserver — scroll to load more
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries[0].isIntersecting &&
                    hasNextPage &&
                    !isFetchingNextPage
                ) {
                    fetchNextPage();
                }
            },
            { threshold: 0.1 }
        );
        const el = loadMoreRef.current;
        if (el) observer.observe(el);
        return () => {
            if (el) observer.unobserve(el);
        };
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    // Nếu page đầu rỗng nhưng vẫn còn cursor, tự tải tiếp để tránh trạng thái "rỗng giả".
    useEffect(() => {
        if (!isLoading && allPosts.length === 0 && hasNextPage && !isFetching) {
            fetchNextPage();
        }
    }, [allPosts.length, fetchNextPage, hasNextPage, isFetching, isLoading]);

    return (
        <div className='space-y-4 max-w-xl mx-auto'>
            <h1 className='text-xl font-bold text-gray-900 dark:text-dark-text'>
                Khám phá
            </h1>

            {/* Topic filter */}
            <div className='flex flex-wrap gap-2'>
                <button
                    onClick={() => handleTopicChange(null)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedTopicId === null
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-dark-card text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-border'
                    }`}
                >
                    Tất cả
                </button>
                {topics?.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => handleTopicChange(t.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            selectedTopicId === t.id
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-dark-card text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-border'
                        }`}
                    >
                        #{t.name}
                    </button>
                ))}
            </div>

            {/* Initial loading */}
            {isLoading && (
                <div className='space-y-3'>
                    {[...Array(3)].map((_, i) => (
                        <PostCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {/* Empty */}
            {!isLoading && allPosts.length === 0 && (
                <div className='text-center py-12 text-gray-400 dark:text-dark-muted'>
                    <p className='text-4xl mb-3'>📭</p>
                    <p>Chưa có bài viết nào. Hãy là người đầu tiên đăng bài!</p>
                </div>
            )}

            {/* Posts */}
            {allPosts.map((post) => (
                <PostCard key={post.id} post={{ ...post, feed_score: 0 }} />
            ))}

            {/* Load more */}
            {(allPosts.length > 0 || hasNextPage) && (
                <div ref={loadMoreRef} className='py-4 text-center'>
                    {(isFetching || isFetchingNextPage) && (
                        <div className='space-y-3'>
                            {[...Array(2)].map((_, i) => (
                                <PostCardSkeleton key={i} />
                            ))}
                        </div>
                    )}
                    {!hasNextPage && (
                        <p className='text-gray-400 dark:text-dark-muted text-sm'>
                            Hết bài viết
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
