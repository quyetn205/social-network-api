import {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode
} from 'react';
import { authApi } from '../services/auth';
import type { User } from '../services/types';

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    updateUser: (user: User) => void;
    register: (data: {
        username: string;
        email: string;
        password: string;
        date_of_birth?: string;
    }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session on app load
    useEffect(() => {
        const token = sessionStorage.getItem('access_token');
        const savedUser = sessionStorage.getItem('user');
        if (token && savedUser) {
            setAccessToken(token);
            setUser(JSON.parse(savedUser));
            // Verify token still valid
            authApi
                .getMe()
                .then(setUser)
                .catch(() => {
                    sessionStorage.removeItem('access_token');
                    sessionStorage.removeItem('refresh_token');
                    sessionStorage.removeItem('user');
                    setAccessToken(null);
                    setUser(null);
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = async (username: string, password: string) => {
        const res = await authApi.login(username, password);
        sessionStorage.setItem('access_token', res.access_token);
        sessionStorage.setItem('refresh_token', res.refresh_token);
        setAccessToken(res.access_token);

        const me = await authApi.getMe();
        setUser(me);
        sessionStorage.setItem('user', JSON.stringify(me));
    };

    const logout = () => {
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('user');
        setAccessToken(null);
        setUser(null);
        window.location.href = '/login';
    };

    const updateUser = (nextUser: User) => {
        setUser(nextUser);
        sessionStorage.setItem('user', JSON.stringify(nextUser));
    };

    const register = async (data: {
        username: string;
        email: string;
        password: string;
        date_of_birth?: string;
    }) => {
        await authApi.register(data);
        // Auto-login after register
        await login(data.username, data.password);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                accessToken,
                isLoading,
                login,
                logout,
                updateUser,
                register
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
