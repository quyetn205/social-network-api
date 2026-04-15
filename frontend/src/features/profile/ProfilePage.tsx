import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../services/users';
import type { PostWithScore, User } from '../../services/types';
import Avatar from '../../components/ui/Avatar';
import PostCard from '../feed/PostCard';
import {
    ProfileSkeleton,
    PostCardSkeleton,
    UserListSkeleton
} from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

type Tab = 'posts' | 'followers' | 'following';

export default function ProfilePage() {
    const { userId } = useParams<{ userId: string }>();
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>('posts');

    const uid = Number(userId);
    const isOwnProfile = currentUser?.id === uid;

    const { data: user, isLoading: userLoading } = useQuery({
        queryKey: ['user', uid],
        queryFn: () => usersApi.getUserProfile(uid)
    });

    const { data: followStatus, isLoading: followStatusLoading } = useQuery({
        queryKey: ['follow-status', uid],
        queryFn: () => usersApi.getFollowStatus(uid),
        enabled: !isOwnProfile
    });

    const following = followStatus?.following ?? false;

    const followMutation = useMutation({
        mutationFn: () =>
            following ? usersApi.unfollowUser(uid) : usersApi.followUser(uid),
        onMutate: async () => {
            await queryClient.cancelQueries({
                queryKey: ['follow-status', uid]
            });

            const previousFollowStatus = queryClient.getQueryData<{
                following: boolean;
            }>(['follow-status', uid]);

            const nextFollowing = !following;
            queryClient.setQueryData(['follow-status', uid], {
                following: nextFollowing
            });

            queryClient.setQueryData(['user', uid], (old: any) => {
                if (!old) return old;
                const prevCount = Number(old.followers_count || 0);
                const delta = nextFollowing ? 1 : -1;
                return {
                    ...old,
                    followers_count: Math.max(0, prevCount + delta)
                };
            });

            return { previousFollowStatus };
        },
        onSuccess: (data) => {
            queryClient.setQueryData(['follow-status', uid], {
                following: data.following
            });
            showToast(
                data.following
                    ? 'Đã theo dõi người dùng này'
                    : 'Đã bỏ theo dõi người dùng này',
                'success'
            );
        },
        onError: (_error, _vars, context) => {
            if (context?.previousFollowStatus) {
                queryClient.setQueryData(
                    ['follow-status', uid],
                    context.previousFollowStatus
                );
            }
            showToast('Không thể cập nhật trạng thái theo dõi', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['follow-status', uid] });
            queryClient.invalidateQueries({ queryKey: ['user', uid] });
            queryClient.invalidateQueries({ queryKey: ['followers', uid] });
            queryClient.invalidateQueries({ queryKey: ['following', uid] });
            if (currentUser?.id) {
                queryClient.invalidateQueries({
                    queryKey: ['user', currentUser.id]
                });
                queryClient.invalidateQueries({
                    queryKey: ['following', currentUser.id]
                });
            }
        }
    });

    const { data: userPosts, isLoading: loadingPosts } = useQuery({
        queryKey: ['user-posts', uid],
        queryFn: () => usersApi.getUserPosts(uid),
        enabled: tab === 'posts'
    });

    const { data: followersData, isLoading: loadingFollowers } = useQuery({
        queryKey: ['followers', uid],
        queryFn: () => usersApi.getFollowers(uid),
        enabled: tab === 'followers'
    });

    const { data: followingData, isLoading: loadingFollowing } = useQuery({
        queryKey: ['following', uid],
        queryFn: () => usersApi.getFollowing(uid),
        enabled: tab === 'following'
    });

    if (userLoading) {
        return (
            <div className='max-w-xl mx-auto space-y-4'>
                <ProfileSkeleton />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='text-center py-8 text-red-400 dark:text-red-400'>
                Người dùng không tồn tại.
            </div>
        );
    }

    const tabs: { key: Tab; label: string }[] = [
        { key: 'posts', label: 'Bài viết' },
        { key: 'followers', label: 'Người theo dõi' },
        { key: 'following', label: 'Đang theo dõi' }
    ];

    return (
        <div className='max-w-xl mx-auto space-y-4'>
            {/* Profile card */}
            <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6'>
                <div className='flex items-center gap-4'>
                    <Avatar
                        username={user.username}
                        avatarUrl={user.avatar_url}
                        size='lg'
                    />
                    <div className='flex-1'>
                        <h1 className='text-xl font-bold text-gray-900 dark:text-dark-text'>
                            {user.username}
                        </h1>
                        <p className='text-gray-500 dark:text-dark-muted text-sm'>
                            {user.email}
                        </p>
                        {user.date_of_birth && (
                            <p className='text-gray-400 dark:text-dark-muted text-xs mt-1'>
                                Sinh nhật: {user.date_of_birth}
                            </p>
                        )}
                    </div>

                    {!isOwnProfile && (
                        <button
                            onClick={() => followMutation.mutate()}
                            disabled={
                                followMutation.isPending || followStatusLoading
                            }
                            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                                following
                                    ? 'bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-dark-bg'
                                    : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                        >
                            {followMutation.isPending || followStatusLoading
                                ? '...'
                                : following
                                  ? 'Đã theo dõi'
                                  : 'Theo dõi'}
                        </button>
                    )}
                </div>

                <div className='flex gap-6 mt-4 pt-4 border-t border-gray-100 dark:border-dark-border'>
                    <button
                        className='text-center cursor-pointer'
                        onClick={() => setTab('posts')}
                    >
                        <div
                            className={`text-lg font-bold ${tab === 'posts' ? 'text-blue-500' : 'text-gray-900 dark:text-dark-text'}`}
                        >
                            {user.posts_count ?? '-'}
                        </div>
                        <div className='text-xs text-gray-400 dark:text-dark-muted'>
                            Bài viết
                        </div>
                    </button>
                    <button
                        className='text-center cursor-pointer'
                        onClick={() => setTab('followers')}
                    >
                        <div
                            className={`text-lg font-bold ${tab === 'followers' ? 'text-blue-500' : 'text-gray-900 dark:text-dark-text'}`}
                        >
                            {user.followers_count ?? '-'}
                        </div>
                        <div className='text-xs text-gray-400 dark:text-dark-muted'>
                            Người theo dõi
                        </div>
                    </button>
                    <button
                        className='text-center cursor-pointer'
                        onClick={() => setTab('following')}
                    >
                        <div
                            className={`text-lg font-bold ${tab === 'following' ? 'text-blue-500' : 'text-gray-900 dark:text-dark-text'}`}
                        >
                            {user.following_count ?? '-'}
                        </div>
                        <div className='text-xs text-gray-400 dark:text-dark-muted'>
                            Đang theo dõi
                        </div>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border'>
                <div className='flex border-b border-gray-200 dark:border-dark-border'>
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                tab === t.key
                                    ? 'text-blue-500 border-b-2 border-blue-500'
                                    : 'text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className='p-4'>
                    {tab === 'posts' && (
                        <div className='space-y-3'>
                            {loadingPosts &&
                                [...Array(2)].map((_, i) => (
                                    <PostCardSkeleton key={i} />
                                ))}
                            {!loadingPosts &&
                                (!userPosts?.items ||
                                    userPosts.items.length === 0) && (
                                    <div className='text-center py-8 text-gray-400 dark:text-dark-muted'>
                                        <p>Chưa có bài viết nào.</p>
                                    </div>
                                )}
                            {userPosts?.items?.map((post: PostWithScore) => (
                                <PostCard
                                    key={post.id}
                                    post={{ ...post, feed_score: 0 }}
                                />
                            ))}
                        </div>
                    )}

                    {tab === 'followers' && (
                        <div className='space-y-3'>
                            {loadingFollowers && <UserListSkeleton count={4} />}
                            {!loadingFollowers &&
                                (!followersData?.items ||
                                    followersData.items.length === 0) && (
                                    <div className='text-center py-8 text-gray-400 dark:text-dark-muted'>
                                        <p>Chưa có người theo dõi nào.</p>
                                    </div>
                                )}
                            <div className='grid grid-cols-2 gap-3'>
                                {followersData?.items?.map((u: User) => (
                                    <Link
                                        key={u.id}
                                        to={`/profile/${u.id}`}
                                        className='flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors'
                                    >
                                        <Avatar
                                            username={u.username}
                                            avatarUrl={u.avatar_url}
                                            size='sm'
                                        />
                                        <div className='min-w-0'>
                                            <div className='font-medium text-gray-900 dark:text-dark-text truncate text-sm'>
                                                {u.username}
                                            </div>
                                            <div className='text-xs text-gray-400 dark:text-dark-muted truncate'>
                                                {u.email}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'following' && (
                        <div className='space-y-3'>
                            {loadingFollowing && <UserListSkeleton count={4} />}
                            {!loadingFollowing &&
                                (!followingData?.items ||
                                    followingData.items.length === 0) && (
                                    <div className='text-center py-8 text-gray-400 dark:text-dark-muted'>
                                        <p>Chưa theo dõi ai.</p>
                                    </div>
                                )}
                            <div className='grid grid-cols-2 gap-3'>
                                {followingData?.items?.map((u: User) => (
                                    <Link
                                        key={u.id}
                                        to={`/profile/${u.id}`}
                                        className='flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors'
                                    >
                                        <Avatar
                                            username={u.username}
                                            avatarUrl={u.avatar_url}
                                            size='sm'
                                        />
                                        <div className='min-w-0'>
                                            <div className='font-medium text-gray-900 dark:text-dark-text truncate text-sm'>
                                                {u.username}
                                            </div>
                                            <div className='text-xs text-gray-400 dark:text-dark-muted truncate'>
                                                {u.email}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
