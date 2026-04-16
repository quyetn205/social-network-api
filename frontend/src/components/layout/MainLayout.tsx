import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

// Bố cục khung chính của ứng dụng.
export default function MainLayout() {
    return (
        <div className='min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors'>
            <Navbar />
            <div className='max-w-5xl mx-auto px-4 py-4 md:py-6 flex gap-4 md:gap-6'>
                {/* Desktop sidebar */}
                <Sidebar />
                {/* Main content */}
                <main className='flex-1 min-w-0 pb-20 md:pb-0'>
                    <Outlet />
                </main>
            </div>
            {/* Mobile bottom nav */}
            <BottomNav />
        </div>
    );
}
