import { api } from '../lib/api';
import type {
    Post,
    PostWithScore,
    Topic,
    Comment,
    LikeStatus,
    PostVisibility
} from './types';

export interface PaginatedPosts {
    items: Post[];
    next_cursor: string | null;
}

export interface PaginatedPostsWithScore {
    items: PostWithScore[];
    next_cursor: string | null;
}

export const postsApi = {
    // Lấy feed bài viết.
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

    // Lấy chi tiết bài viết.
    getPost: async (postId: number): Promise<Post> => {
        const res = await api.get<Post>(`/posts/${postId}`);
        return res.data;
    },

    // Tạo bài viết mới.
    createPost: async (
        content: string,
        topicIds: number[] = [],
        imageFile?: File | null,
        visibility: PostVisibility = 'public'
    ): Promise<Post> => {
        const formData = new FormData();
        formData.append('content', content);
        formData.append('topic_ids', JSON.stringify(topicIds));
        formData.append('visibility', visibility);
        if (imageFile) {
            formData.append('image', imageFile);
        }

        const res = await api.post<Post>('/posts/', formData);
        return res.data;
    },

    // Cập nhật bài viết.
    updatePost: async (
        postId: number,
        content: string,
        topicIds?: number[],
        imageFile?: File | null,
        removeImage = false,
        visibility?: PostVisibility
    ): Promise<Post> => {
        const formData = new FormData();
        formData.append('content', content);
        if (topicIds !== undefined) {
            formData.append('topic_ids', JSON.stringify(topicIds));
        }
        if (visibility !== undefined) {
            formData.append('visibility', visibility);
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

    // Xóa bài viết.
    deletePost: async (postId: number): Promise<void> => {
        await api.delete(`/posts/${postId}`);
    },

    // Lấy danh sách bài khám phá.
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

    // Tìm bài viết.
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

    // Lấy danh sách chủ đề.
    getTopics: async (): Promise<Topic[]> => {
        const res = await api.get<Topic[]>('/topics/');
        return res.data;
    },

    // Lấy bình luận của bài viết.
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

    // Tạo bình luận.
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

    // Lấy trạng thái thích.
    getLikeStatus: async (postId: number): Promise<LikeStatus> => {
        const res = await api.get<LikeStatus>(`/likes/posts/${postId}/status/`);
        return res.data;
    },

    // Thích bài viết.
    likePost: async (postId: number): Promise<LikeStatus> => {
        const res = await api.post<LikeStatus>(`/likes/posts/${postId}/like/`);
        return res.data;
    },

    // Bỏ thích bài viết.
    unlikePost: async (postId: number): Promise<LikeStatus> => {
        const res = await api.delete<LikeStatus>(
            `/likes/posts/${postId}/like/`
        );
        return res.data;
    }
};
