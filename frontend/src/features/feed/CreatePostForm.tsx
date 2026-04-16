import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi } from '../../services/posts';
import TopicSelector from '../../components/ui/TopicSelector';
import { useToast } from '../../context/ToastContext';
import type { PostVisibility } from '../../services/types';

// Hiển thị form tạo bài viết.
export default function CreatePostForm() {
    const [content, setContent] = useState('');
    const [selectedTopics, setSelectedTopics] = useState<number[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [visibility, setVisibility] = useState<PostVisibility>('public');
    const queryClient = useQueryClient();
    const { showToast } = useToast();

    const createMutation = useMutation({
        mutationFn: () =>
            postsApi.createPost(content, selectedTopics, imageFile, visibility),
        onSuccess: () => {
            setContent('');
            setSelectedTopics([]);
            setImageFile(null);
            setImagePreview(null);
            setVisibility('public');
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            showToast('Bài viết đã được đăng!', 'success');
        },
        onError: () => {
            showToast('Đăng bài thất bại. Vui lòng thử lại.', 'error');
        }
    });

    return (
        <div className='bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3'>
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder='Bạn đang nghĩ gì?'
                className='w-full resize-none border border-gray-200 dark:border-dark-border rounded-lg p-3 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-dark-bg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-24'
                maxLength={2000}
            />

            <TopicSelector
                selected={selectedTopics}
                onChange={setSelectedTopics}
            />

            <div>
                <label className='block text-sm font-medium text-gray-600 dark:text-dark-muted mb-1'>
                    Ai có thể xem bài viết này?
                </label>
                <select
                    value={visibility}
                    onChange={(e) =>
                        setVisibility(e.target.value as PostVisibility)
                    }
                    className='w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text'
                >
                    <option value='public'>Công khai</option>
                    <option value='friend'>Bạn bè</option>
                    <option value='private'>Chỉ mình tôi</option>
                </select>
                <p className='text-xs text-gray-400 dark:text-dark-muted mt-1'>
                    Công khai: ai cũng thấy. Bạn bè: người theo dõi lẫn nhau.
                    Chỉ mình tôi: riêng tư.
                </p>
            </div>

            {imagePreview && (
                <div className='overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg'>
                    <img
                        src={imagePreview}
                        alt='Ảnh xem trước'
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
                            setImageFile(file);
                            setImagePreview(URL.createObjectURL(file));
                        }}
                    />
                    <span>🖼️</span>
                    <span>{imageFile ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
                </label>

                {imageFile && (
                    <button
                        type='button'
                        onClick={() => {
                            setImageFile(null);
                            setImagePreview(null);
                        }}
                        className='text-sm text-red-500 hover:text-red-600'
                    >
                        Xóa ảnh
                    </button>
                )}
            </div>

            <div className='flex items-center justify-between'>
                <span className='text-xs text-gray-400 dark:text-dark-muted'>
                    {content.length}/2000
                </span>
                <button
                    onClick={() => createMutation.mutate()}
                    disabled={!content.trim() || createMutation.isPending}
                    className='bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                >
                    {createMutation.isPending ? 'Đang đăng...' : 'Đăng'}
                </button>
            </div>
        </div>
    );
}
