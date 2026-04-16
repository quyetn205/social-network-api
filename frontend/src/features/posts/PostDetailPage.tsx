import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import { bookmarksApi } from '../../services/bookmarks';
import { api } from '../../lib/api';
import Avatar from '../../components/ui/Avatar';
import TopicBadge from '../../components/ui/TopicBadge';
import CommentItem from './CommentItem';
import {
    PostCardSkeleton,
    CommentSkeleton
} from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Comment } from '../../services/types';

function timeAgo(dateStr: string) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return `${diff}s trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
    return `${Math.floor(diff / 86400)}d trước`;
}

export default function PostDetailPage() {
    const { postId } = useParams<{ postId: string }>();
    const { user } = useAuth();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [commentContent, setCommentContent] = useState('');
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [bookmarked, setBookmarked] = useState(false);

    const { data: post, isLoading } = useQuery({
        queryKey: ['post', postId],
        queryFn: () => postsApi.getPost(Number(postId))
    });

    const { data: likeStatus } = useQuery({
        queryKey: ['likeStatus', postId],
        queryFn: () =>
            api
                .get<{ liked: boolean }>(`/likes/posts/${postId}/status/`)
                .then((r: { data: { liked: boolean } }) => r.data),
        enabled: !!postId
    });

    // Sync like state from server data
    useEffect(() => {
        if (likeStatus) setLiked(likeStatus.liked);
    }, [likeStatus]);

    useEffect(() => {
        if (post) setLikeCount(post.likes_count);
    }, [post]);

    const { data: commentsData, isLoading: loadingComments } = useQuery({
        queryKey: ['comments', postId],
        queryFn: () => postsApi.getComments(Number(postId))
    });

    const comments = commentsData?.comments ?? [];

    const commentMutation = useMutation({
        mutationFn: (data: { content: string; parentId?: number }) =>
            postsApi.createComment(Number(postId), data.content, data.parentId),
        onSuccess: () => {
            setCommentContent('');
            queryClient.invalidateQueries({ queryKey: ['comments', postId] });
            queryClient.invalidateQueries({ queryKey: ['post', postId] });
            showToast('Bình luận thành công!', 'success');
        },
        onError: () => {
            showToast('Gửi bình luận thất bại', 'error');
        }
    });

    const likeMutation = useMutation({
        mutationFn: async () => {
            const id = Number(postId);
            const status = await postsApi.getLikeStatus(id);
            if (status.liked) {
                await postsApi.unlikePost(id);
                return { liked: false, delta: -1 };
            }
            await postsApi.likePost(id);
            return { liked: true, delta: 1 };
        },
        onSuccess: (result) => {
            setLiked(result.liked);
            setLikeCount((c) => Math.max(0, c + result.delta));
        },
        onError: () => {
            showToast('Không thể thích bài viết', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['post', postId] });
            queryClient.invalidateQueries({ queryKey: ['likeStatus', postId] });
        }
    });

    const bookmarkMutation = useMutation({
        mutationFn: () =>
            bookmarked
                ? bookmarksApi.unbookmark(Number(postId))
                : bookmarksApi.bookmark(Number(postId)),
        onMutate: () => {
            setBookmarked(!bookmarked);
            showToast(
                bookmarked ? 'Đã bỏ lưu bài viết' : 'Đã lưu bài viết',
                'success'
            );
        },
        onError: () => {
            setBookmarked(bookmarked);
            showToast('Không thể lưu bài viết', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: ['bookmarkStatus', postId]
            });
        }
    });

    if (isLoading) {
        return (
            <div className='max-w-xl mx-auto space-y-4'>
                <PostCardSkeleton />
                <PostCardSkeleton />
            </div>
        );
    }

    if (!post) {
        return (
            <div className='text-center py-8 text-red-400 dark:text-red-400'>
                Bài viết không tồn tại.
            </div>
        );
    }

    const handleReply = (parentId: number, content: string) => {
        commentMutation.mutate({ content, parentId });
    };

    const topLevel = comments?.filter((c: Comment) => !c.parent_id) || [];
    const getReplies = (parentId: number) =>
        comments?.filter((c: Comment) => c.parent_id === parentId) || [];

    return (
        <div className='max-w-xl mx-auto space-y-4'>
            {/* Back */}
            <Link
                to='/feed'
                className='text-sm text-blue-500 hover:underline dark:text-blue-400'
            >
                ← Quay lại bảng tin
            </Link>

            {/* Post */}
            <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 space-y-3'>
                <div className='flex items-center gap-3'>
                    {post.author && (
                        <Link to={`/profile/${post.author.id}`}>
                            <Avatar
                                username={post.author.username}
                                avatarUrl={post.author.avatar_url}
                            />
                        </Link>
                    )}
                    <div>
                        {post.author && (
                            <Link
                                to={`/profile/${post.author.id}`}
                                className='font-semibold text-gray-900 dark:text-dark-text hover:text-blue-500'
                            >
                                {post.author.username}
                            </Link>
                        )}
                        <div className='text-xs text-gray-400 dark:text-dark-muted'>
                            {timeAgo(post.created_at)}
                        </div>
                    </div>
                </div>

                <p className='text-gray-800 dark:text-dark-text whitespace-pre-wrap'>
                    {post.content}
                </p>

                {post.image_url && (
                    <div className='overflow-hidden rounded-xl border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg'>
                        <img
                            src={post.image_url}
                            alt={post.content || 'Ảnh bài viết'}
                            className='max-h-[40rem] w-full object-cover'
                            loading='lazy'
                        />
                    </div>
                )}

                {post.topics.length > 0 && (
                    <div className='flex flex-wrap gap-1.5'>
                        {post.topics.map(
                            (t: {
                                id: number;
                                name: string;
                                description: string | null;
                            }) => (
                                <TopicBadge key={t.id} topic={t} />
                            )
                        )}
                    </div>
                )}

                <div className='flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-dark-border'>
                    <button
                        onClick={() => user && likeMutation.mutate()}
                        disabled={!user || likeMutation.isPending}
                        className={`flex items-center gap-1.5 text-sm transition-colors ${
                            liked
                                ? 'text-red-500'
                                : 'text-gray-500 dark:text-dark-muted hover:text-red-400'
                        }`}
                    >
                        <span>{liked ? '❤️' : '🤍'}</span>
                        <span>{likeCount}</span>
                    </button>
                    <span className='text-sm text-gray-400 dark:text-dark-muted'>
                        💬 {post.comments_count}
                    </span>
                    <button
                        onClick={() => user && bookmarkMutation.mutate()}
                        disabled={!user || bookmarkMutation.isPending}
                        className={`ml-auto flex items-center gap-1.5 text-sm transition-colors ${
                            bookmarked
                                ? 'text-yellow-500'
                                : 'text-gray-500 dark:text-dark-muted hover:text-yellow-400'
                        }`}
                        title={bookmarked ? 'Bỏ lưu' : 'Lưu bài viết'}
                    >
                        <span>{bookmarked ? '🔖' : '💾'}</span>
                    </button>
                </div>
            </div>

            {/* Comment form */}
            {user && (
                <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'>
                    <textarea
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                        placeholder='Viết bình luận...'
                        className='w-full border border-gray-200 dark:border-dark-border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder:text-gray-400'
                        rows={3}
                    />
                    <div className='flex justify-end'>
                        <button
                            onClick={() =>
                                commentMutation.mutate({
                                    content: commentContent
                                })
                            }
                            disabled={
                                !commentContent.trim() ||
                                commentMutation.isPending
                            }
                            className='bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors'
                        >
                            {commentMutation.isPending
                                ? 'Đang gửi...'
                                : 'Bình luận'}
                        </button>
                    </div>
                </div>
            )}

            {/* Comments */}
            <div className='space-y-4'>
                {loadingComments && (
                    <div className='space-y-3'>
                        {[...Array(3)].map((_, i) => (
                            <CommentSkeleton key={i} />
                        ))}
                    </div>
                )}
                {topLevel.map((comment: Comment) => (
                    <div
                        key={comment.id}
                        className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'
                    >
                        <CommentItem comment={comment} onReply={handleReply} />
                        {getReplies(comment.id).map((reply: Comment) => (
                            <div key={reply.id} className='ml-8'>
                                <CommentItem
                                    comment={reply}
                                    onReply={handleReply}
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
