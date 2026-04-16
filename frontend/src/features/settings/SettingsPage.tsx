import { useState, useEffect, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../services/users';
import TopicSelector from '../../components/ui/TopicSelector';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';

export default function SettingsPage() {
    const { user, logout, updateUser } = useAuth();
    const { showToast } = useToast();
    const { theme, toggleTheme } = useTheme();
    const queryClient = useQueryClient();

    const [username, setUsername] = useState(user?.username || '');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '');
    const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [selectedTopics, setSelectedTopics] = useState<number[]>([]);

    const { data: preferences } = useQuery({
        queryKey: ['preferences'],
        queryFn: usersApi.getPreferences
    });

    useEffect(() => {
        if (preferences?.topics) {
            setSelectedTopics(preferences.topics.map((t: any) => t.id));
        }
    }, [preferences]);

    useEffect(() => {
        setUsername(user?.username || '');
        setAvatarFile(null);
        setAvatarPreview(user?.avatar_url || '');
        setDateOfBirth(user?.date_of_birth || '');
    }, [user]);

    useEffect(() => {
        return () => {
            if (avatarPreview.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreview);
            }
        };
    }, [avatarPreview]);

    const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        if (avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview);
        }
        setAvatarFile(file);
        setAvatarPreview(
            file ? URL.createObjectURL(file) : user?.avatar_url || ''
        );
    };

    const updateProfileMutation = useMutation({
        mutationFn: () =>
            usersApi.updateMe({
                username,
                date_of_birth: dateOfBirth,
                avatarFile
            }),
        onSuccess: (updatedUser) => {
            updateUser(updatedUser);
            if (user?.id) {
                queryClient.invalidateQueries({ queryKey: ['user', user.id] });
                queryClient.invalidateQueries({
                    queryKey: ['user-posts', user.id]
                });
            }
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.invalidateQueries({ queryKey: ['post'] });
            queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
            queryClient.invalidateQueries({ queryKey: ['followers'] });
            queryClient.invalidateQueries({ queryKey: ['following'] });
            setAvatarFile(null);
            setAvatarPreview(updatedUser.avatar_url || '');
            showToast('Cập nhật thông tin thành công!', 'success');
        },
        onError: () =>
            showToast('Cập nhật thất bại. Vui lòng thử lại.', 'error')
    });

    const changePasswordMutation = useMutation({
        mutationFn: () => {
            if (newPassword !== confirmPassword)
                throw new Error('Mật khẩu mới không khớp');
            if (newPassword.length < 6)
                throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
            return usersApi.changePassword(currentPassword, newPassword);
        },
        onSuccess: () => {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            showToast('Đổi mật khẩu thành công!', 'success');
        },
        onError: (err: any) =>
            showToast(err.message || 'Đổi mật khẩu thất bại', 'error')
    });

    const updatePreferencesMutation = useMutation({
        mutationFn: () => usersApi.updatePreferences(selectedTopics),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['preferences'] });
            showToast('Cập nhật sở thích thành công!', 'success');
        },
        onError: () => showToast('Cập nhật sở thích thất bại.', 'error')
    });

    const deleteAccountMutation = useMutation({
        mutationFn: () => usersApi.deleteAccount(),
        onSuccess: () => logout(),
        onError: () => showToast('Xóa tài khoản thất bại.', 'error')
    });

    const cardClass =
        'bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 space-y-4';
    const labelClass =
        'block text-sm font-medium text-gray-600 dark:text-dark-muted mb-1';
    const inputClass =
        'w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder:text-gray-400';

    return (
        <div className='max-w-xl mx-auto space-y-4'>
            <h1 className='text-xl font-bold text-gray-900 dark:text-dark-text'>
                Cài đặt
            </h1>

            {/* Thông tin cá nhân */}
            <div className={cardClass}>
                <h2 className='font-semibold text-gray-700 dark:text-dark-text'>
                    Thông tin cá nhân
                </h2>
                <div>
                    <label className={labelClass}>Tên đăng nhập</label>
                    <input
                        type='text'
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Email</label>
                    <input
                        type='email'
                        value={user?.email || ''}
                        disabled
                        className={`${inputClass} bg-gray-50 dark:bg-dark-border cursor-not-allowed opacity-60`}
                    />
                </div>
                <div>
                    <label className={labelClass}>Ngày sinh</label>
                    <input
                        type='date'
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Ảnh đại diện từ file</label>
                    <input
                        type='file'
                        accept='image/*'
                        onChange={handleAvatarFileChange}
                        className={`${inputClass} file:mr-4 file:rounded-md file:border-0 file:bg-blue-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-600`}
                    />
                    <p className='text-xs text-gray-400 dark:text-dark-muted mt-1'>
                        Chọn ảnh từ máy tính để tải avatar mới lên hệ thống.
                    </p>
                </div>
                {avatarPreview ? (
                    <div className='flex items-center gap-3 rounded-lg border border-dashed border-gray-200 dark:border-dark-border p-3'>
                        <img
                            src={avatarPreview}
                            alt='Xem trước avatar'
                            className='h-14 w-14 rounded-full object-cover border border-gray-200 dark:border-dark-border'
                        />
                        <div className='min-w-0'>
                            <p className='text-sm font-medium text-gray-800 dark:text-dark-text'>
                                Xem trước avatar
                            </p>
                            <p className='text-xs text-gray-500 dark:text-dark-muted'>
                                Ảnh này sẽ được lưu sau khi bạn bấm lưu thay
                                đổi.
                            </p>
                        </div>
                    </div>
                ) : null}
                <div className='pt-2'>
                    <button
                        onClick={() => updateProfileMutation.mutate()}
                        disabled={updateProfileMutation.isPending}
                        className='bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50'
                    >
                        {updateProfileMutation.isPending
                            ? 'Đang lưu...'
                            : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>

            {/* Đổi mật khẩu */}
            <div className={cardClass}>
                <h2 className='font-semibold text-gray-700 dark:text-dark-text'>
                    Đổi mật khẩu
                </h2>
                <div>
                    <label className={labelClass}>Mật khẩu hiện tại</label>
                    <input
                        type='password'
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className={inputClass}
                        placeholder='••••••••'
                    />
                </div>
                <div>
                    <label className={labelClass}>Mật khẩu mới</label>
                    <input
                        type='password'
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass}
                        placeholder='Tối thiểu 6 ký tự'
                    />
                </div>
                <div>
                    <label className={labelClass}>Xác nhận mật khẩu mới</label>
                    <input
                        type='password'
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={inputClass}
                        placeholder='Nhập lại mật khẩu mới'
                    />
                </div>
                <div className='pt-2'>
                    <button
                        onClick={() => changePasswordMutation.mutate()}
                        disabled={
                            changePasswordMutation.isPending ||
                            !currentPassword ||
                            !newPassword ||
                            !confirmPassword
                        }
                        className='bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50'
                    >
                        {changePasswordMutation.isPending
                            ? 'Đang đổi...'
                            : 'Đổi mật khẩu'}
                    </button>
                </div>
            </div>

            {/* Sở thích */}
            <div className={cardClass}>
                <h2 className='font-semibold text-gray-700 dark:text-dark-text mb-1'>
                    Chủ đề bạn quan tâm
                </h2>
                <p className='text-sm text-gray-500 dark:text-dark-muted mb-4'>
                    Chọn các chủ đề bạn yêu thích để bảng tin cá nhân hóa hiển
                    thị nội dung phù hợp với bạn.
                </p>
                <TopicSelector
                    selected={selectedTopics}
                    onChange={setSelectedTopics}
                />
                <div className='pt-4 border-t border-gray-100 dark:border-dark-border'>
                    <button
                        onClick={() => updatePreferencesMutation.mutate()}
                        disabled={updatePreferencesMutation.isPending}
                        className='bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50'
                    >
                        {updatePreferencesMutation.isPending
                            ? 'Đang lưu...'
                            : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>

            {/* Giao diện */}
            <div className={cardClass}>
                <h2 className='font-semibold text-gray-700 dark:text-dark-text'>
                    Giao diện
                </h2>
                <div className='flex items-center justify-between'>
                    <div>
                        <p className='text-sm font-medium text-gray-800 dark:text-dark-text'>
                            Chế độ tối
                        </p>
                        <p className='text-xs text-gray-500 dark:text-dark-muted mt-0.5'>
                            {theme === 'dark'
                                ? 'Đang bật chế độ tối 🌙'
                                : 'Đang bật chế độ sáng ☀️'}
                        </p>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className='px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-border transition-colors'
                    >
                        {theme === 'dark' ? '☀️ Chế độ sáng' : '🌙 Chế độ tối'}
                    </button>
                </div>
            </div>

            {/* Xóa tài khoản */}
            <div className='bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-6 space-y-4'>
                <div>
                    <h2 className='font-semibold text-red-600 dark:text-red-400'>
                        Xóa tài khoản
                    </h2>
                    <p className='text-sm text-red-500 dark:text-red-400 mt-1'>
                        Khi xóa, toàn bộ bài viết, bình luận và dữ liệu của bạn
                        sẽ bị mất vĩnh viễn.
                    </p>
                </div>
                <button
                    onClick={() =>
                        window.confirm(
                            'Bạn có chắc muốn xóa tài khoản? Hành động này không thể hoàn tác.'
                        ) && deleteAccountMutation.mutate()
                    }
                    disabled={deleteAccountMutation.isPending}
                    className='bg-red-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50'
                >
                    {deleteAccountMutation.isPending
                        ? 'Đang xóa...'
                        : 'Xóa tài khoản'}
                </button>
            </div>
        </div>
    );
}
