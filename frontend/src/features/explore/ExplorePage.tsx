import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import PostCard from '../feed/PostCard';
import type { Post, Topic } from '../../services/types';
import { PostCardSkeleton } from '../../components/ui/Skeleton';

const LIMIT = 10;

// Hiển thị trang khám phá bài viết.
export default function ExplorePage() {
    const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [allPosts, setAllPosts] = useState<Post[]>([]);
    const [page, setPage] = useState(0);
    const hasMoreRef = useRef(true);
    const cursorRef = useRef<string | null>(null);
    const isFetchingRef = useRef(false);
    const topicRef = useRef<number | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    cursorRef.current = cursor;
    topicRef.current = selectedTopicId;

    const { data: topics } = useQuery({
        queryKey: ['topics'],
        queryFn: postsApi.getTopics
    });

    const { isLoading, isFetching } = useQuery({
        queryKey: ['explore', selectedTopicId, page],
        queryFn: async () => {
            if (isFetchingRef.current) return null;
            isFetchingRef.current = true;
            try {
                const data = await postsApi.explore(
                    topicRef.current ?? undefined,
                    cursorRef.current ?? undefined,
                    LIMIT
                );
                if (cursorRef.current === null) {
                    setAllPosts(data.items);
                } else {
                    setAllPosts((prev) => [...prev, ...data.items]);
                }
                hasMoreRef.current = data.next_cursor !== null;
                setCursor(data.next_cursor);
                return data;
            } finally {
                isFetchingRef.current = false;
            }
        },
        staleTime: 30_000
    });

    // Đổi bộ lọc chủ đề.
    const handleTopicChange = (topicId: number | null) => {
        setSelectedTopicId(topicId);
        setAllPosts([]);
        setCursor(null);
        setPage(0);
        hasMoreRef.current = true;
    };

    // IntersectionObserver — scroll to load more
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries[0].isIntersecting &&
                    hasMoreRef.current &&
                    !isFetchingRef.current
                ) {
                    setPage((p) => p + 1);
                }
            },
            { threshold: 0.1 }
        );
        const el = loadMoreRef.current;
        if (el) observer.observe(el);
        return () => {
            if (el) observer.unobserve(el);
        };
    }, []);

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
            {allPosts.length > 0 && (
                <div ref={loadMoreRef} className='py-4 text-center'>
                    {isFetching && (
                        <div className='space-y-3'>
                            {[...Array(2)].map((_, i) => (
                                <PostCardSkeleton key={i} />
                            ))}
                        </div>
                    )}
                    {!hasMoreRef.current && (
                        <p className='text-gray-400 dark:text-dark-muted text-sm'>
                            Hết bài viết
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
