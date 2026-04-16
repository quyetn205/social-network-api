import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { usersApi } from '../../services/users';
import Avatar from '../ui/Avatar';

const navItems = [
    { to: '/feed', label: 'Bảng tin', icon: '📰' },
    { to: '/explore', label: 'Khám phá', icon: '🔍' },
    { to: '/notifications', label: 'Thông báo', icon: '🔔' },
    { to: '/bookmarks', label: 'Đã lưu', icon: '💾' },
    { to: '/search', label: 'Tìm kiếm', icon: '🔎' }
];

// Hiển thị thanh điều hướng bên trái.
export default function Sidebar() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<
        { id: number; username: string; email: string; avatar_url?: string }[]
    >([]);
    const [showResults, setShowResults] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('#sidebar-search')) setShowResults(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Tìm người dùng từ sidebar.
    const handleSearch = (val: string) => {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!val.trim()) {
            setResults([]);
            setShowResults(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await usersApi.searchUsers(val);
                setResults(data.slice(0, 5));
                setShowResults(true);
            } catch {
                setResults([]);
            }
        }, 300);
    };

    return (
        <aside className='w-44 xl:w-52 flex-shrink-0 hidden md:block'>
            <div className='sticky top-20 space-y-1'>
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                isActive
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-card'
                            }`
                        }
                    >
                        <span>{item.icon}</span>
                        {item.label}
                    </NavLink>
                ))}

                {user && (
                    <NavLink
                        to={`/profile/${user.id}`}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                isActive
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-card'
                            }`
                        }
                    >
                        <span>👤</span>
                        Trang cá nhân
                    </NavLink>
                )}

                <NavLink
                    to='/settings'
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-card'
                        }`
                    }
                >
                    <span>⚙️</span>
                    Cài đặt
                </NavLink>

                {/* Sidebar search */}
                <div id='sidebar-search' className='relative mt-2'>
                    <input
                        type='text'
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder='Tìm người...'
                        className='w-full bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-dark-text placeholder:text-gray-400'
                    />
                    {showResults && results.length > 0 && (
                        <div className='absolute top-full mt-1 left-0 right-0 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-lg overflow-hidden z-50'>
                            {results.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => {
                                        navigate(`/profile/${u.id}`);
                                        setQuery('');
                                        setShowResults(false);
                                    }}
                                    className='w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-bg text-left'
                                >
                                    <Avatar
                                        username={u.username}
                                        avatarUrl={u.avatar_url}
                                        size='sm'
                                    />
                                    <span className='text-sm font-medium text-gray-900 dark:text-dark-text truncate'>
                                        {u.username}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
