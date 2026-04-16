import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Hiển thị form đăng ký.
export default function RegisterPage() {
    const [form, setForm] = useState({
        username: '',
        email: '',
        password: '',
        date_of_birth: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    // Gửi thông tin đăng ký.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            // HTML date input returns YYYY-MM-DD, but some locales / manual entry
            // may produce DD/MM/YYYY — handle both formats transparently.
            let dateOfBirth: string | undefined = form.date_of_birth;
            if (dateOfBirth && dateOfBirth.includes('/')) {
                const [d, m, y] = dateOfBirth.split('/');
                dateOfBirth = `${y}-${m}-${d}`;
            }
            await register({ ...form, date_of_birth: dateOfBirth });
            navigate('/login');
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setError(
                e.response?.data?.detail ||
                    'Đăng ký thất bại. Vui lòng thử lại.'
            );
        } finally {
            setLoading(false);
        }
    };

    const inputClass =
        'w-full px-4 py-2.5 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder:text-gray-400';

    // Cập nhật từng ô nhập.
    const handleInputChange = (
        field: 'username' | 'email' | 'password' | 'date_of_birth',
        value: string
    ) => {
        setForm({ ...form, [field]: value });
        // Clear field-specific errors on typing
        if (field === 'username' && value.length >= 3) setError('');
        if (field === 'email' && value.includes('@')) setError('');
        if (field === 'password' && value.length >= 6) setError('');
    };

    return (
        <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg px-4'>
            <div className='w-full max-w-md bg-white dark:bg-dark-card rounded-2xl shadow-lg p-8'>
                <h1 className='text-2xl font-bold text-center text-gray-800 dark:text-dark-text mb-2'>
                    Tạo tài khoản mới
                </h1>
                <p className='text-center text-gray-500 dark:text-dark-muted mb-6'>
                    Tham gia cùng cộng đồng mạng xã hội!
                </p>

                {error && (
                    <div className='mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg'>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div>
                        <label className='block text-sm font-medium text-gray-700 dark:text-dark-muted mb-1'>
                            Tên đăng nhập
                        </label>
                        <input
                            type='text'
                            value={form.username}
                            onChange={(e) =>
                                handleInputChange('username', e.target.value)
                            }
                            className={inputClass}
                            placeholder='4–20 ký tự: chữ cái, số và dấu gạch dưới'
                            pattern='[a-zA-Z0-9_]{4,20}'
                            title='4–20 ký tự: chữ cái, số và dấu gạch dưới'
                            required
                        />
                    </div>
                    <div>
                        <label className='block text-sm font-medium text-gray-700 dark:text-dark-muted mb-1'>
                            Email
                        </label>
                        <input
                            type='email'
                            value={form.email}
                            onChange={(e) =>
                                handleInputChange('email', e.target.value)
                            }
                            className={inputClass}
                            placeholder='example@email.com'
                            required
                        />
                    </div>
                    <div>
                        <label className='block text-sm font-medium text-gray-700 dark:text-dark-muted mb-1'>
                            Mật khẩu
                        </label>
                        <input
                            type='password'
                            value={form.password}
                            onChange={(e) =>
                                handleInputChange('password', e.target.value)
                            }
                            className={inputClass}
                            placeholder='Ít nhất 8 ký tự'
                            minLength={8}
                            required
                        />
                    </div>
                    <div>
                        <label className='block text-sm font-medium text-gray-700 dark:text-dark-muted mb-1'>
                            Ngày sinh (tùy chọn)
                        </label>
                        <input
                            type='date'
                            value={form.date_of_birth}
                            onChange={(e) =>
                                handleInputChange(
                                    'date_of_birth',
                                    e.target.value
                                )
                            }
                            className={inputClass}
                        />
                    </div>
                    <button
                        type='submit'
                        disabled={loading}
                        className='w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50'
                    >
                        {loading ? 'Đang đăng ký...' : 'Đăng ký'}
                    </button>
                </form>

                <p className='text-center text-sm text-gray-500 dark:text-dark-muted mt-4'>
                    Đã có tài khoản?{' '}
                    <Link
                        to='/login'
                        className='text-blue-500 hover:underline font-medium'
                    >
                        Đăng nhập
                    </Link>
                </p>
            </div>
        </div>
    );
}
