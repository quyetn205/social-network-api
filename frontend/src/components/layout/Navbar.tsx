import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usersApi } from '../../services/users';
import Avatar from '../ui/Avatar';
import NotificationBell from '../ui/NotificationBell';
import { useQueryClient } from '@tanstack/react-query'

// Hiển thị thanh điều hướng trên cùng.
export default function Navbar() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const handleHomeClick = (e: React.MouseEvent) => {
    if (location.pathname === '/feed') {
      e.preventDefault() 
      window.scrollTo({ top: 0, behavior: 'smooth' })
      queryClient.invalidateQueries({ queryKey: ['feed'] }) 
    }
  }
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<
        { id: number; username: string; email: string; avatar_url?: string }[]
    >([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [, setShowNotifications] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
            }
            if (
                notifRef.current &&
                !notifRef.current.contains(e.target as Node)
            ) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Tìm người dùng theo tên.
    const handleSearch = (value: string) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!value.trim()) {
            setResults([]);
            setShowDropdown(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await usersApi.searchUsers(value);
                setResults(data.slice(0, 5));
                setShowDropdown(true);
            } catch {
                setResults([]);
            }
        }, 300);
    };

    // Đi tới trang hồ sơ của kết quả.
    const handleResultClick = (userId: number) => {
        setQuery('');
        setResults([]);
        setShowDropdown(false);
        navigate(`/profile/${userId}`);
    };

    return (
        <header className='sticky top-0 z-50 bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border transition-colors'>
            <div className='max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3'>
                {/* Logo */}
                <Link
                    to='/feed' onClick={handleHomeClick}
                    className='text-xl font-bold text-blue-500 shrink-0'
                >
                    🌐 SocialNet
                </Link>

                {/* Search - hidden on small mobile */}
                <div
                    className='relative flex-1 max-w-xs hidden sm:block'
                    ref={dropdownRef}
                >
                    <input
                        type='text'
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() =>
                            query.trim() &&
                            results.length > 0 &&
                            setShowDropdown(true)
                        }
                        placeholder='Tìm kiếm người dùng...'
                        className='w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-full px-4 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900 dark:text-dark-text placeholder:text-gray-400'
                    />
                    {showDropdown && results.length > 0 && (
                        <div className='absolute top-full mt-1 left-0 right-0 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-lg overflow-hidden z-50'>
                            {results.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => handleResultClick(u.id)}
                                    className='w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors text-left'
                                >
                                    <Avatar
                                        username={u.username}
                                        avatarUrl={u.avatar_url}
                                        size='sm'
                                    />
                                    <div className='min-w-0'>
                                        <div className='font-medium text-gray-900 dark:text-dark-text text-sm truncate'>
                                            {u.username}
                                        </div>
                                        <div className='text-xs text-gray-400 truncate'>
                                            {u.email}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Desktop nav links */}
                <nav className='hidden md:flex items-center gap-1 shrink-0'>
                    <Link
                        to='/feed' onClick={handleHomeClick}
                        className='px-3 py-2 rounded-lg text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium transition-colors'
                    >
                        📰
                    </Link>
                    <Link
                        to='/explore'
                        className='px-3 py-2 rounded-lg text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium transition-colors'
                    >
                        🔍
                    </Link>
                    <Link
                        to='/settings'
                        className='px-3 py-2 rounded-lg text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium transition-colors'
                    >
                        ⚙️
                    </Link>
                </nav>

                {/* Right actions */}
                <div className='flex items-center gap-2 shrink-0'>
                    {/* Dark mode toggle */}
                    <button
                        onClick={toggleTheme}
                        className='p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-bg transition-colors'
                        title={
                            theme === 'dark'
                                ? 'Chuyển sang chế độ sáng'
                                : 'Chuyển sang chế độ tối'
                        }
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>

                    {/* Notifications bell */}
                    {user && <NotificationBell />}

                    {/* User avatar + name */}
                    {user && (
                        <div className='hidden sm:flex items-center gap-2'>
                            <Link to={`/profile/${user.id}`}>
                                <Avatar
                                    username={user.username}
                                    avatarUrl={user.avatar_url}
                                    size='sm'
                                />
                            </Link>
                            <span className='text-sm text-gray-700 dark:text-dark-text font-medium'>
                                {user.username}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={logout}
                        className='text-sm text-gray-500 hover:text-red-500 transition-colors hidden sm:block'
                    >
                        🚪
                    </button>

                    {/* Mobile menu button */}
                    <button
                        onClick={() => setShowMobileMenu(!showMobileMenu)}
                        className='p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-bg md:hidden'
                    >
                        {showMobileMenu ? '✕' : '☰'}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {showMobileMenu && (
                <div className='md:hidden border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-4 py-3 space-y-1'>
                    {/* Mobile search */}
                    <div className='relative mb-3'>
                        <input
                            type='text'
                            value={query}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder='Tìm kiếm người dùng...'
                            className='w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-dark-text'
                        />
                    </div>
                    <Link
                        to='/feed'
                        onClick={() => setShowMobileMenu(false)}
                        className='flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium'
                    >
                        📰 Bảng tin
                    </Link>
                    <Link
                        to='/explore'
                        onClick={() => setShowMobileMenu(false)}
                        className='flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium'
                    >
                        🔍 Khám phá
                    </Link>
                    {user && (
                        <Link
                            to={`/profile/${user.id}`}
                            onClick={() => setShowMobileMenu(false)}
                            className='flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium'
                        >
                            👤 Trang cá nhân
                        </Link>
                    )}
                    <Link
                        to='/settings'
                        onClick={() => setShowMobileMenu(false)}
                        className='flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg text-sm font-medium'
                    >
                        ⚙️ Cài đặt
                    </Link>
                    <button
                        onClick={logout}
                        className='flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-red-500 hover:bg-red-50 text-sm font-medium'
                    >
                        🚪 Đăng xuất
                    </button>
                </div>
            )}
        </header>
    );
}
