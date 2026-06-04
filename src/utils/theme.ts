import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bterminal-theme';
export const THEME_CHANGE_EVENT = 'bterminal-themechange';

type ThemePalette = {
  bg: string;
  panel: string;
  elevated: string;
  hover: string;
  border: string;
  accent: string;
  positive: string;
  negative: string;
  text: string;
  muted: string;
  faint: string;
  blue: string;
  purple: string;
  chartGrid: string;
  positiveDim: string;
  negativeDim: string;
  blueDim: string;
};

function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function getStoredThemePreference(): ThemeMode | null {
  if (!canUseDOM()) return null;

  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function getSystemThemeMode(): ThemeMode {
  if (!canUseDOM()) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveThemeMode(preference: ThemeMode | null): ThemeMode {
  return preference ?? 'dark';
}

export function applyThemeMode(mode: ThemeMode): ThemeMode {
  if (!canUseDOM()) return mode;

  const root = document.documentElement;
  const hasChanged = root.dataset.theme !== mode || root.style.colorScheme !== mode;

  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  if (hasChanged) {
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }));
  }

  return mode;
}

export function initializeThemeMode(): ThemeMode {
  return applyThemeMode(resolveThemeMode(getStoredThemePreference()));
}

export function setStoredThemePreference(preference: ThemeMode | null): void {
  if (!canUseDOM()) return;

  if (preference) {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } else {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  }
}

export function subscribeToSystemThemeChange(listener: (mode: ThemeMode) => void): () => void {
  if (!canUseDOM()) return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = (event: MediaQueryListEvent) => listener(event.matches ? 'dark' : 'light');

  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
}

export function getThemePalette(): ThemePalette {
  const rgb = (triplet: string): string => {
    const normalized = triplet.trim().replace(/\s+/g, ', ');
    return `rgb(${normalized})`;
  };

  const rgba = (triplet: string, alpha: number): string => {
    const normalized = triplet.trim().replace(/\s+/g, ', ');
    return `rgba(${normalized}, ${alpha})`;
  };

  if (!canUseDOM()) {
    return {
      bg: 'rgb(7, 10, 14)',
      panel: 'rgb(13, 17, 23)',
      elevated: 'rgb(22, 27, 34)',
      hover: 'rgb(28, 33, 40)',
      border: 'rgb(33, 38, 45)',
      accent: 'rgb(240, 165, 0)',
      positive: 'rgb(63, 185, 80)',
      negative: 'rgb(248, 81, 73)',
      text: 'rgb(230, 237, 243)',
      muted: 'rgb(139, 148, 158)',
      faint: 'rgb(72, 79, 88)',
      blue: 'rgb(88, 166, 255)',
      purple: 'rgb(210, 168, 255)',
      chartGrid: 'rgb(22, 27, 34)',
      positiveDim: 'rgba(63, 185, 80, 0.18)',
      negativeDim: 'rgba(248, 81, 73, 0.18)',
      blueDim: 'rgba(88, 166, 255, 0.24)',
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const readRgb = (name: string, fallback: string) => read(name, fallback);

  return {
    bg: rgb(readRgb('--terminal-bg-rgb', '7 10 14')),
    panel: rgb(readRgb('--terminal-panel-rgb', '13 17 23')),
    elevated: rgb(readRgb('--terminal-elevated-rgb', '22 27 34')),
    hover: rgb(readRgb('--terminal-hover-rgb', '28 33 40')),
    border: rgb(readRgb('--terminal-border-rgb', '33 38 45')),
    accent: rgb(readRgb('--terminal-accent-rgb', '240 165 0')),
    positive: rgb(readRgb('--terminal-positive-rgb', '63 185 80')),
    negative: rgb(readRgb('--terminal-negative-rgb', '248 81 73')),
    text: rgb(readRgb('--terminal-text-rgb', '230 237 243')),
    muted: rgb(readRgb('--terminal-muted-rgb', '139 148 158')),
    faint: rgb(readRgb('--terminal-faint-rgb', '72 79 88')),
    blue: rgb(readRgb('--terminal-blue-rgb', '88 166 255')),
    purple: rgb(readRgb('--terminal-purple-rgb', '210 168 255')),
    chartGrid: rgb(readRgb('--terminal-chart-grid-rgb', '22 27 34')),
    positiveDim: rgba(readRgb('--terminal-positive-rgb', '63 185 80'), 0.18),
    negativeDim: rgba(readRgb('--terminal-negative-rgb', '248 81 73'), 0.18),
    blueDim: rgba(readRgb('--terminal-blue-rgb', '88 166 255'), 0.24),
  };
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemeMode | null>(() => getStoredThemePreference());
  const [mode, setMode] = useState<ThemeMode>(() => resolveThemeMode(getStoredThemePreference()));

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextMode = (event as CustomEvent<ThemeMode>).detail;
      setMode(nextMode);
      setPreference(getStoredThemePreference());
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  useEffect(() => {
    const nextMode = resolveThemeMode(preference);
    setMode(nextMode);
    applyThemeMode(nextMode);
  }, [preference]);

  const setThemePreference = (nextPreference: ThemeMode | null) => {
    setStoredThemePreference(nextPreference);
    setPreference(nextPreference);
  };

  const toggleTheme = () => {
    setThemePreference(mode === 'dark' ? 'light' : 'dark');
  };

  return {
    mode,
    preference,
    isDefaultTheme: preference === null,
    setThemePreference,
    toggleTheme,
  };
}
