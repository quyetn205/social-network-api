import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { notificationsApi } from '../../services/notifications';
import { useNotificationsStream } from '../../hooks/useNotificationsStream';

// Hiển thị chuông thông báo và số lượng chưa đọc.
export default function NotificationBell() {
    useNotificationsStream();

    const { data: unreadData } = useQuery({
        queryKey: ['notifications', 'unread'],
        queryFn: notificationsApi.getUnreadCount
    });

    const count = unreadData?.count ?? 0;

    return (
        <Link
            to='/notifications'
            className='relative p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 transition-colors'
            title='Thông báo'
        >
            <span className='text-lg'>🔔</span>
            {count > 0 && (
                <span className='absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center'>
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </Link>
    );
}
