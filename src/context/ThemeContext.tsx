import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentColor = 'green' | 'blue' | 'purple' | 'orange';

export const ACCENT_OPTIONS: { id: AccentColor; label: string; color: string }[] = [
  { id: 'green', label: 'Hijau', color: '#10b981' },
  { id: 'blue', label: 'Biru', color: '#3b82f6' },
  { id: 'purple', label: 'Ungu', color: '#8b5cf6' },
  { id: 'orange', label: 'Oranye', color: '#f97316' },
];

interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('sainbyte_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'dark';
  });

  const [accent, setAccent] = useState<AccentColor>(() => {
    const saved = localStorage.getItem('sainbyte_accent');
    if (saved === 'green' || saved === 'blue' || saved === 'purple' || saved === 'orange') {
      return saved;
    }
    return 'orange';
  });

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = themeMode === 'system' ? systemDark : themeMode === 'dark';

  useEffect(() => {
    localStorage.setItem('sainbyte_theme', themeMode);
    document.documentElement.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0D0D0D' : '#f8fafc');
    }
  }, [themeMode, isDark]);

  useEffect(() => {
    localStorage.setItem('sainbyte_accent', accent);
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, isDark, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme harus digunakan di dalam ThemeProvider');
  return ctx;
}
