import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { ReactNode } from 'react';

// Chặn truy cập khi chưa đăng nhập.
export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className='flex items-center justify-center min-h-screen'>
                <div className='text-gray-500'>Đang tải...</div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to='/login' state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
