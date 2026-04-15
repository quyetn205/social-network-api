import axios from 'axios';

// const API_BASE_URL = 'https://social-network-api-f1kb.onrender.com/api/v1'
const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

function processQueue(_error: Error | null, token: string | null = null) {
    refreshQueue.forEach((cb) => cb(token || ''));
    refreshQueue = [];
}

api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true;
            if (!isRefreshing) {
                isRefreshing = true;
                const refreshToken = sessionStorage.getItem('refresh_token');
                if (!refreshToken) {
                    sessionStorage.removeItem('access_token');
                    sessionStorage.removeItem('refresh_token');
                    sessionStorage.removeItem('user');
                    window.location.href = '/login';
                    return Promise.reject(error);
                }
                try {
                    const res = await axios.post(
                        `${API_BASE_URL}/auth/refresh`,
                        { refresh_token: refreshToken }
                    );
                    const { access_token, refresh_token: newRefresh } =
                        res.data;
                    sessionStorage.setItem('access_token', access_token);
                    sessionStorage.setItem('refresh_token', newRefresh);
                    processQueue(null, access_token);
                    isRefreshing = false;
                    original.headers.Authorization = `Bearer ${access_token}`;
                    return api(original);
                } catch {
                    processQueue(new Error('refresh failed'), null);
                    isRefreshing = false;
                    sessionStorage.removeItem('access_token');
                    sessionStorage.removeItem('refresh_token');
                    sessionStorage.removeItem('user');
                    window.location.href = '/login';
                    return Promise.reject(error);
                }
            }
            return new Promise((resolve, reject) => {
                refreshQueue.push((token: string) => {
                    if (token) {
                        original.headers.Authorization = `Bearer ${token}`;
                        resolve(api(original));
                    } else {
                        reject(error);
                    }
                });
            });
        }
        return Promise.reject(error);
    }
);

export { API_BASE_URL };
