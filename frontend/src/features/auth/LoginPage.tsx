import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

// Hiển thị form đăng nhập.
export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const { theme: _theme } = useTheme();
    void _theme;
    const navigate = useNavigate();

    // Gửi thông tin đăng nhập.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username, password);
            navigate('/feed');
        } catch {
            setError('Tên đăng nhập hoặc mật khẩu không đúng');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg px-4'>
            <div className='w-full max-w-md bg-white dark:bg-dark-card rounded-2xl shadow-lg p-8'>
                <h1 className='text-2xl font-bold text-center text-gray-800 dark:text-dark-text mb-2'>
                    Đăng nhập
                </h1>
                <p className='text-center text-gray-500 dark:text-dark-muted mb-6'>
                    Chào mừng bạn quay trở lại!
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
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className='w-full px-4 py-2.5 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder:text-gray-400'
                            placeholder='Nhập tên đăng nhập'
                            required
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 dark:text-dark-muted mb-1'>
                            Mật khẩu
                        </label>
                        <input
                            type='password'
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className='w-full px-4 py-2.5 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text placeholder:text-gray-400'
                            placeholder='Nhập mật khẩu'
                            required
                        />
                    </div>

                    <button
                        type='submit'
                        disabled={loading}
                        className='w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50'
                    >
                        {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                </form>

                <p className='text-center text-sm text-gray-500 dark:text-dark-muted mt-4'>
                    Chưa có tài khoản?{' '}
                    <Link
                        to='/register'
                        className='text-blue-500 hover:underline font-medium'
                    >
                        Đăng ký ngay
                    </Link>
                </p>
            </div>
        </div>
    );
}
