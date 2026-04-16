import {
    createContext,
    useContext,
    useState,
    useCallback,
    type ReactNode
} from 'react';
import Toast from '../components/ui/Toast';

interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

// Cung cấp hệ thống thông báo ngắn.
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [nextId, setNextId] = useState(1);

    // Thêm một toast mới vào danh sách.
    const showToast = useCallback(
        (message: string, type: 'success' | 'error' | 'info' = 'info') => {
            const id = nextId;
            setNextId((n) => n + 1);
            setToasts((prev) => [...prev, { id, message, type }]);
        },
        [nextId]
    );

    // Xóa toast theo id.
    const removeToast = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    onClose={() => removeToast(toast.id)}
                />
            ))}
        </ToastContext.Provider>
    );
}

// Lấy hàm hiển thị toast.
export const useToast = () => useContext(ToastContext);
