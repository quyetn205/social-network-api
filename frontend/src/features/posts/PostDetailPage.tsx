import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import { bookmarksApi } from '../../services/bookmarks';
import { api } from '../../lib/api';
import Avatar from '../../components/ui/Avatar';
import TopicBadge from '../../components/ui/TopicBadge';
import TopicSelector from '../../components/ui/TopicSelector';
import CommentItem from './CommentItem';
import {
    PostCardSkeleton,
    CommentSkeleton
} from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Comment, PostVisibility } from '../../services/types';

// Tính thời gian đã trôi qua.
function timeAgo(dateStr: string) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return `${diff}s trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
    return `${Math.floor(diff / 86400)}d trước`;
}

function visibilityLabel(visibility?: PostVisibility) {
    switch (visibility) {
        case 'friend':
            return 'Bạn bè';
        case 'private':
            return 'Chỉ mình tôi';
        default:
            return 'Công khai';
    }
}

// Hiển thị chi tiết một bài viết.
export default function PostDetailPage() {
    const { postId } = useParams<{ postId: string }>();
    const { user } = useAuth();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [commentContent, setCommentContent] = useState('');
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [editTopics, setEditTopics] = useState<number[]>([]);
    const [editVisibility, setEditVisibility] =
        useState<PostVisibility>('public');
    const [editImageFile, setEditImageFile] = useState<File | null>(null);
    const [editImagePreview, setEditImagePreview] = useState<string | null>(
        null
    );
    const [removeEditImage, setRemoveEditImage] = useState(false);
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

    useEffect(() => {
        if (!post) return;
        setEditContent(post.content);
        setEditTopics(post.topics.map((topic) => topic.id));
        setEditVisibility(post.visibility || 'public');
        setEditImagePreview(post.image_url || null);
        setEditImageFile(null);
        setRemoveEditImage(false);
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

    const editMutation = useMutation({
        mutationFn: () =>
            postsApi.updatePost(
                Number(postId),
                editContent,
                editTopics,
                editImageFile,
                removeEditImage,
                editVisibility
            ),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: ['post', postId] });
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.setQueryData(['post', postId], updated);
            setEditing(false);
            setEditImageFile(null);
            setRemoveEditImage(false);
            setEditImagePreview(updated.image_url || null);
            showToast('Đã cập nhật bài viết', 'success');
        },
        onError: () => {
            showToast('Cập nhật thất bại', 'error');
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

    if (editing) {
        return (
            <div className='max-w-xl mx-auto space-y-4'>
                <Link
                    to='/feed'
                    className='text-sm text-blue-500 hover:underline dark:text-blue-400'
                >
                    ← Quay lại bảng tin
                </Link>

                <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'>
                    <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className='w-full border border-gray-200 dark:border-dark-border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text'
                        rows={4}
                    />
                    <TopicSelector
                        selected={editTopics}
                        onChange={setEditTopics}
                    />
                    <div>
                        <label className='block text-sm font-medium text-gray-600 dark:text-dark-muted mb-1'>
                            Ai có thể xem bài viết này?
                        </label>
                        <select
                            value={editVisibility}
                            onChange={(e) =>
                                setEditVisibility(
                                    e.target.value as PostVisibility
                                )
                            }
                            className='w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text'
                        >
                            <option value='public'>Công khai</option>
                            <option value='friend'>Bạn bè</option>
                            <option value='private'>Chỉ mình tôi</option>
                        </select>
                    </div>
                    {editImagePreview && (
                        <div className='overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg'>
                            <img
                                src={editImagePreview}
                                alt='Ảnh bài viết'
                                className='max-h-80 w-full object-cover'
                            />
                        </div>
                    )}
                    <div className='flex items-center gap-3'>
                        <label className='inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg'>
                            <input
                                type='file'
                                accept='image/*'
                                className='hidden'
                                onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    if (!file) return;
                                    setEditImageFile(file);
                                    setRemoveEditImage(false);
                                    setEditImagePreview(
                                        URL.createObjectURL(file)
                                    );
                                }}
                            />
                            <span>🖼️</span>
                            <span>
                                {editImagePreview ? 'Đổi ảnh' : 'Thêm ảnh'}
                            </span>
                        </label>

                        {editImagePreview && (
                            <button
                                type='button'
                                onClick={() => {
                                    setEditImageFile(null);
                                    setEditImagePreview(null);
                                    setRemoveEditImage(true);
                                }}
                                className='text-sm text-red-500 hover:text-red-600'
                            >
                                Xóa ảnh
                            </button>
                        )}
                    </div>
                    <div className='flex gap-2 justify-end'>
                        <button
                            onClick={() => {
                                setEditing(false);
                                setEditImageFile(null);
                                setRemoveEditImage(false);
                                setEditImagePreview(post.image_url || null);
                                setEditContent(post.content);
                                setEditTopics(
                                    post.topics.map((topic) => topic.id)
                                );
                                setEditVisibility(post.visibility || 'public');
                            }}
                            className='px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-border'
                        >
                            Hủy
                        </button>
                        <button
                            onClick={() => editMutation.mutate()}
                            disabled={
                                editMutation.isPending || !editContent.trim()
                            }
                            className='px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50'
                        >
                            {editMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Gửi phản hồi cho một bình luận.
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
                    <span className='ml-auto text-xs bg-gray-100 dark:bg-dark-bg text-gray-500 dark:text-dark-muted px-2 py-1 rounded-full'>
                        {visibilityLabel(post.visibility)}
                    </span>
                    {user?.id === post.author_id && (
                        <button
                            onClick={() => setEditing(true)}
                            className='p-1.5 rounded-lg text-gray-400 dark:text-dark-muted hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors'
                            title='Sửa'
                        >
                            ✏️
                        </button>
                    )}
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
