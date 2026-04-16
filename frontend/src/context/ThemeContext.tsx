import {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'light',
    toggleTheme: () => {}
});

// Cung cấp trạng thái giao diện sáng/tối.
export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme') as Theme | null;
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    });

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    // Đổi qua lại giữa sáng và tối.
    const toggleTheme = () => {
        setTheme((t) => (t === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// Lấy context giao diện hiện tại.
export const useTheme = () => useContext(ThemeContext);
