import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import FeedPage from './features/feed/FeedPage';
import ExplorePage from './features/explore/ExplorePage';
import PostDetailPage from './features/posts/PostDetailPage';
import ProfilePage from './features/profile/ProfilePage';
import SettingsPage from './features/settings/SettingsPage';
import NotificationsPage from './features/notifications/NotificationsPage';
import BookmarksPage from './features/bookmarks/BookmarksPage';
import SearchPage from './features/search/SearchPage';

// Khai báo toàn bộ tuyến đường của ứng dụng.
export default function App() {
    return (
        <AuthProvider>
            <ThemeProvider>
                <ToastProvider>
                    <Routes>
                        {/* Public */}
                        <Route path='/login' element={<LoginPage />} />
                        <Route path='/register' element={<RegisterPage />} />

                        {/* Protected */}
                        <Route
                            element={
                                <ProtectedRoute>
                                    <MainLayout />
                                </ProtectedRoute>
                            }
                        >
                            <Route
                                path='/'
                                element={<Navigate to='/feed' replace />}
                            />
                            <Route path='/feed' element={<FeedPage />} />
                            <Route path='/explore' element={<ExplorePage />} />
                            <Route
                                path='/posts/:postId'
                                element={<PostDetailPage />}
                            />
                            <Route
                                path='/profile/:userId'
                                element={<ProfilePage />}
                            />
                            <Route
                                path='/settings'
                                element={<SettingsPage />}
                            />
                            <Route
                                path='/notifications'
                                element={<NotificationsPage />}
                            />
                            <Route
                                path='/bookmarks'
                                element={<BookmarksPage />}
                            />
                            <Route path='/search' element={<SearchPage />} />
                        </Route>

                        {/* 404 */}
                        <Route path='*' element={<Navigate to='/' replace />} />
                    </Routes>
                </ToastProvider>
            </ThemeProvider>
        </AuthProvider>
    );
}
