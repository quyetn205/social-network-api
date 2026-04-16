import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import { bookmarksApi } from '../../services/bookmarks';
import { api } from '../../lib/api';
import type {
    PostWithScore,
    Topic,
    LikeStatus,
    PostVisibility
} from '../../services/types';
import Avatar from '../../components/ui/Avatar';
import TopicBadge from '../../components/ui/TopicBadge';
import TopicSelector from '../../components/ui/TopicSelector';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface PostCardProps {
    post: PostWithScore;
}

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

// Hiển thị một thẻ bài viết trong feed.
export default function PostCard({ post }: PostCardProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const { data: likeStatus } = useQuery({
        queryKey: ['likeStatus', post.id],
        queryFn: () =>
            api
                .get<LikeStatus>(`/likes/posts/${post.id}/status/`)
                .then((r) => r.data),
        enabled: !!user,
        staleTime: 300000
    });

    const { data: bookmarkStatus, isLoading: isBookmarkLoading } = useQuery({
        queryKey: ['bookmarkStatus', post.id],
        queryFn: () =>
            api
                .get<{
                    bookmarked: boolean;
                }>(`/bookmarks/posts/${post.id}/status`)
                .then((r) => r.data),
        staleTime: 300000
    });

    const [liked, setLiked] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);

    React.useEffect(() => {
        if (likeStatus) setLiked(likeStatus.liked);
    }, [likeStatus]);
    React.useEffect(() => {
        if (!user) setLiked(false);
    }, [user]);
    React.useEffect(() => {
        if (bookmarkStatus) setBookmarked(bookmarkStatus.bookmarked);
    }, [bookmarkStatus]);

    const [likeCount, setLikeCount] = useState(post.likes_count);
    React.useEffect(() => {
        setLikeCount(post.likes_count);
    }, [post.likes_count]);
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState(post.content);
    const [editTopics, setEditTopics] = useState<number[]>(
        post.topics.map((t: Topic) => t.id)
    );
    const [editVisibility, setEditVisibility] = useState<PostVisibility>(
        post.visibility || 'public'
    );
    const [editImageFile, setEditImageFile] = useState<File | null>(null);
    const [editImagePreview, setEditImagePreview] = useState<string | null>(
        post.image_url || null
    );
    const [removeEditImage, setRemoveEditImage] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const isOwner = user?.id === post.author_id;

    const likeMutation = useMutation({
        mutationFn: async () => {
            const status = await postsApi.getLikeStatus(post.id);
            if (status.liked) {
                await postsApi.unlikePost(post.id);
                return { liked: false, delta: -1 };
            }
            await postsApi.likePost(post.id);
            return { liked: true, delta: 1 };
        },
        onSuccess: (result) => {
            setLiked(result.liked);
            setLikeCount((c: number) => Math.max(0, c + result.delta));
        },
        onError: () => {
            showToast('Không thể thích bài viết', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: ['likeStatus', post.id]
            });
            queryClient.invalidateQueries({
                queryKey: ['post', String(post.id)]
            });
        }
    });

    const editMutation = useMutation({
        mutationFn: () =>
            postsApi.updatePost(
                post.id,
                editContent,
                editTopics,
                editImageFile,
                removeEditImage,
                editVisibility
            ),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.setQueryData(['post', String(post.id)], updated);
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

    const deleteMutation = useMutation({
        mutationFn: () => postsApi.deletePost(post.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            showToast('Đã xóa bài viết', 'success');
        },
        onError: () => {
            showToast('Xóa thất bại', 'error');
        }
    });

    const bookmarkMutation = useMutation({
        mutationFn: async () => {
            const current = await api
                .get<{
                    bookmarked: boolean;
                }>(`/bookmarks/posts/${post.id}/status`)
                .then((r) => r.data.bookmarked);
            return current
                ? bookmarksApi.unbookmark(post.id)
                : bookmarksApi.bookmark(post.id);
        },
        onSuccess: (result) => {
            setBookmarked(result.bookmarked);
        },
        onError: () => {
            showToast('Không thể lưu bài viết', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: ['bookmarkStatus', post.id]
            });
            queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
        }
    });

    if (editing) {
        return (
            <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'>
                <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className='w-full border border-gray-200 dark:border-dark-border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text'
                    rows={4}
                />
                <TopicSelector selected={editTopics} onChange={setEditTopics} />
                <div>
                    <label className='block text-sm font-medium text-gray-600 dark:text-dark-muted mb-1'>
                        Ai có thể xem bài viết này?
                    </label>
                    <select
                        value={editVisibility}
                        onChange={(e) =>
                            setEditVisibility(e.target.value as PostVisibility)
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
                                setEditImagePreview(URL.createObjectURL(file));
                            }}
                        />
                        <span>🖼️</span>
                        <span>{editImagePreview ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
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
                            setEditVisibility(post.visibility || 'public');
                        }}
                        className='px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-border'
                    >
                        Hủy
                    </button>
                    <button
                        onClick={() => editMutation.mutate()}
                        disabled={editMutation.isPending || !editContent.trim()}
                        className='px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50'
                    >
                        {editMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'>
            {/* Header */}
            <div className='flex items-center gap-3'>
                {post.author && (
                    <Link to={`/profile/${post.author.id}`}>
                        <Avatar
                            username={post.author.username}
                            avatarUrl={post.author.avatar_url}
                        />
                    </Link>
                )}
                <div className='flex-1 min-w-0'>
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
                <span className='text-xs bg-gray-100 dark:bg-dark-bg text-gray-500 dark:text-dark-muted px-2 py-1 rounded-full'>
                    {visibilityLabel(post.visibility)}
                </span>
                {post.feed_score > 0 && (
                    <span className='text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full'>
                        {post.feed_score === 3
                            ? '⭐ For You'
                            : post.feed_score === 2
                              ? '🏷️ Phù hợp'
                              : '👥 Follow'}
                    </span>
                )}
                {isOwner && (
                    <div className='flex gap-1'>
                        <button
                            onClick={() => setEditing(true)}
                            className='p-1.5 rounded-lg text-gray-400 dark:text-dark-muted hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors'
                            title='Sửa'
                        >
                            ✏️
                        </button>
                        {confirmDelete ? (
                            <div className='flex items-center gap-1'>
                                <button
                                    onClick={() => deleteMutation.mutate()}
                                    disabled={deleteMutation.isPending}
                                    className='px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600'
                                >
                                    Xóa?
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className='px-2 py-1 rounded text-xs text-gray-500 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-border'
                                >
                                    Hủy
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className='p-1.5 rounded-lg text-gray-400 dark:text-dark-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors'
                                title='Xóa'
                            >
                                🗑️
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Content */}
            <Link to={`/posts/${post.id}`} className='block'>
                {post.image_url && (
                    <div className='mb-3 overflow-hidden rounded-xl border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg'>
                        <img
                            src={post.image_url}
                            alt={post.content || 'Ảnh bài viết'}
                            className='max-h-[32rem] w-full object-cover'
                            loading='lazy'
                        />
                    </div>
                )}
                <p className='text-gray-800 dark:text-dark-text whitespace-pre-wrap break-words'>
                    {post.content}
                </p>
            </Link>

            {/* Topics */}
            {post.topics.length > 0 && (
                <div className='flex flex-wrap gap-1.5'>
                    {post.topics.map((t: Topic) => (
                        <TopicBadge key={t.id} topic={t} />
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className='flex items-center gap-4 pt-1 border-t border-gray-100 dark:border-dark-border'>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (user) likeMutation.mutate();
                    }}
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

                <Link
                    to={`/posts/${post.id}`}
                    className='flex items-center gap-1.5 text-sm text-gray-500 dark:text-dark-muted hover:text-blue-500 dark:hover:text-blue-400 transition-colors'
                >
                    <span>💬</span>
                    <span>{post.comments_count}</span>
                </Link>

                <button
                    onClick={() => user && bookmarkMutation.mutate()}
                    disabled={
                        !user || bookmarkMutation.isPending || isBookmarkLoading
                    }
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
    );
}
