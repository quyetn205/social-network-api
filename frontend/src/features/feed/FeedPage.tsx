import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import type { PostWithScore } from '../../services/types';
import PostCard from './PostCard';
import CreatePostForm from './CreatePostForm';
import { PostCardSkeleton } from '../../components/ui/Skeleton';

const LIMIT = 20;

export default function FeedPage() {
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const {
        data,
        isLoading,
        isFetching,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage
    } = useInfiniteQuery({
        queryKey: ['feed'],
        queryFn: ({ pageParam }) => postsApi.getFeed(pageParam, LIMIT),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
        staleTime: 30_000
    });

    const posts = useMemo(() => {
        const merged: PostWithScore[] = [];
        const seenIds = new Set<number>();

        for (const page of data?.pages ?? []) {
            for (const post of page.items) {
                if (!seenIds.has(post.id)) {
                    seenIds.add(post.id);
                    merged.push(post);
                }
            }
        }

        return merged;
    }, [data]);

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

    return (
        <div className='space-y-4 max-w-xl mx-auto'>
            <CreatePostForm />

            {/* Initial loading */}
            {isLoading && (
                <div className='space-y-3'>
                    {[...Array(3)].map((_, i) => (
                        <PostCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && posts.length === 0 && (
                <div className='text-center py-12 text-gray-400 dark:text-dark-muted'>
                    <p className='text-4xl mb-3'>📭</p>
                    <p>Chưa có bài viết nào trong bảng tin.</p>
                    <p className='text-sm mt-1'>
                        Hãy follow người khác hoặc đăng bài đầu tiên!
                    </p>
                </div>
            )}

            {/* Posts */}
            {posts.map((post) => (
                <PostCard key={post.id} post={post} />
            ))}

            {/* Load more sentinel */}
            {posts.length > 0 && (
                <div ref={loadMoreRef} className='py-4 text-center'>
                    {isFetchingNextPage && (
                        <div className='space-y-3'>
                            {[...Array(2)].map((_, i) => (
                                <PostCardSkeleton key={i} />
                            ))}
                        </div>
                    )}
                    {!hasNextPage && !isFetching && (
                        <p className='text-gray-400 dark:text-dark-muted text-sm'>
                            Bạn đã xem hết bài viết 🎉
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
