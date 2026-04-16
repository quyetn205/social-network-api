import { api } from '../lib/api';
import type { Post, PostWithScore, Topic, Comment, LikeStatus } from './types';

export interface PaginatedPosts {
    items: Post[];
    next_cursor: string | null;
}

export interface PaginatedPostsWithScore {
    items: PostWithScore[];
    next_cursor: string | null;
}

export const postsApi = {
    getFeed: async (
        cursor?: string,
        limit = 20
    ): Promise<PaginatedPostsWithScore> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = String(cursor);
        const res = await api.get<PaginatedPostsWithScore>('/posts/feed', {
            params
        });
        return res.data;
    },

    getPost: async (postId: number): Promise<Post> => {
        const res = await api.get<Post>(`/posts/${postId}`);
        return res.data;
    },

    createPost: async (
        content: string,
        topicIds: number[] = [],
        imageFile?: File | null
    ): Promise<Post> => {
        const formData = new FormData();
        formData.append('content', content);
        formData.append('topic_ids', JSON.stringify(topicIds));
        if (imageFile) {
            formData.append('image', imageFile);
        }

        const res = await api.post<Post>('/posts/', formData);
        return res.data;
    },

    updatePost: async (
        postId: number,
        content: string,
        topicIds?: number[],
        imageFile?: File | null,
        removeImage = false
    ): Promise<Post> => {
        const formData = new FormData();
        formData.append('content', content);
        if (topicIds !== undefined) {
            formData.append('topic_ids', JSON.stringify(topicIds));
        }
        if (imageFile) {
            formData.append('image', imageFile);
        }
        if (removeImage) {
            formData.append('remove_image', 'true');
        }

        const res = await api.put<Post>(`/posts/${postId}`, formData);
        return res.data;
    },

    deletePost: async (postId: number): Promise<void> => {
        await api.delete(`/posts/${postId}`);
    },

    explore: async (
        topicId?: number,
        cursor?: string,
        limit = 10
    ): Promise<PaginatedPosts> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (topicId !== undefined) params.topic_id = String(topicId);
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<PaginatedPosts>('/posts/explore', { params });
        return res.data;
    },

    searchPosts: async (
        query: string,
        cursor?: string,
        limit = 20
    ): Promise<PaginatedPosts> => {
        const params: Record<string, string> = {
            q: query,
            limit: String(limit)
        };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<PaginatedPosts>('/posts/search', { params });
        return res.data;
    },

    getTopics: async (): Promise<Topic[]> => {
        const res = await api.get<Topic[]>('/topics/');
        return res.data;
    },

    getComments: async (
        postId: number,
        cursor?: string,
        limit = 20
    ): Promise<{ comments: Comment[]; next_cursor: string | null }> => {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor !== undefined) params.cursor = cursor;
        const res = await api.get<{
            comments: Comment[];
            next_cursor: string | null;
        }>(`/posts/${postId}/comments/`, { params });
        return res.data;
    },

    createComment: async (
        postId: number,
        content: string,
        parentId?: number
    ): Promise<Comment> => {
        const res = await api.post<Comment>(`/posts/${postId}/comments/`, {
            content,
            parent_id: parentId
        });
        return res.data;
    },

    getLikeStatus: async (postId: number): Promise<LikeStatus> => {
        const res = await api.get<LikeStatus>(`/likes/posts/${postId}/status/`);
        return res.data;
    },

    likePost: async (postId: number): Promise<LikeStatus> => {
        const res = await api.post<LikeStatus>(`/likes/posts/${postId}/like/`);
        return res.data;
    },

    unlikePost: async (postId: number): Promise<LikeStatus> => {
        const res = await api.delete<LikeStatus>(
            `/likes/posts/${postId}/like/`
        );
        return res.data;
    }
};
