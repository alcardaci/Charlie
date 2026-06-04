import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemeAccent = 'blue' | 'cyan' | 'emerald' | 'purple' | 'rose' | 'yellow';

export const THEME_STORAGE_KEY = 'bterminal-theme';
export const THEME_ACCENT_STORAGE_KEY = 'bterminal-theme-accent';
export const THEME_CHANGE_EVENT = 'bterminal-themechange';

type ThemeChangeDetail = {
  mode: ThemeMode;
  accent: ThemeAccent;
};

export const THEME_ACCENT_OPTIONS: Array<{
  key: ThemeAccent;
  label: string;
  description: string;
  darkRgb: string;
  lightRgb: string;
}> = [
  {
    key: 'blue',
    label: 'Light blue',
    description: 'New default Charlie accent.',
    darkRgb: '88 166 255',
    lightRgb: '30 103 191',
  },
  {
    key: 'cyan',
    label: 'Signal cyan',
    description: 'Sharper terminal blue-green.',
    darkRgb: '34 211 238',
    lightRgb: '8 145 178',
  },
  {
    key: 'emerald',
    label: 'Market green',
    description: 'Cool green for a quieter market feel.',
    darkRgb: '52 211 153',
    lightRgb: '5 150 105',
  },
  {
    key: 'purple',
    label: 'Violet',
    description: 'Softer analytical highlight.',
    darkRgb: '168 85 247',
    lightRgb: '126 34 206',
  },
  {
    key: 'rose',
    label: 'Rose',
    description: 'Warm high-contrast accent.',
    darkRgb: '244 114 182',
    lightRgb: '190 24 93',
  },
  {
    key: 'yellow',
    label: 'Classic yellow',
    description: 'Original yellow-ish Charlie accent.',
    darkRgb: '240 165 0',
    lightRgb: '184 117 12',
  },
];

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

export function getStoredThemeAccentPreference(): ThemeAccent | null {
  if (!canUseDOM()) return null;

  const value = window.localStorage.getItem(THEME_ACCENT_STORAGE_KEY);
  return THEME_ACCENT_OPTIONS.some((option) => option.key === value) ? value as ThemeAccent : null;
}

export function getSystemThemeMode(): ThemeMode {
  if (!canUseDOM()) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveThemeMode(preference: ThemeMode | null): ThemeMode {
  return preference ?? 'dark';
}

export function resolveThemeAccent(preference: ThemeAccent | null): ThemeAccent {
  return preference ?? 'blue';
}

function dispatchThemeChange(): void {
  if (!canUseDOM()) return;

  const root = document.documentElement;
  window.dispatchEvent(new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
    detail: {
      mode: root.dataset.theme === 'light' ? 'light' : 'dark',
      accent: resolveThemeAccent(root.dataset.accent as ThemeAccent | null),
    },
  }));
}

export function applyThemeMode(mode: ThemeMode): ThemeMode {
  if (!canUseDOM()) return mode;

  const root = document.documentElement;
  const hasChanged = root.dataset.theme !== mode || root.style.colorScheme !== mode;

  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  if (hasChanged) {
    dispatchThemeChange();
  }

  return mode;
}

export function applyThemeAccent(accent: ThemeAccent): ThemeAccent {
  if (!canUseDOM()) return accent;

  const root = document.documentElement;
  const nextAccent = resolveThemeAccent(accent);
  const hasChanged = root.dataset.accent !== nextAccent;
  root.dataset.accent = nextAccent;

  if (hasChanged) {
    dispatchThemeChange();
  }

  return nextAccent;
}

export function initializeThemeMode(): ThemeMode {
  const mode = applyThemeMode(resolveThemeMode(getStoredThemePreference()));
  applyThemeAccent(resolveThemeAccent(getStoredThemeAccentPreference()));
  return mode;
}

export function setStoredThemePreference(preference: ThemeMode | null): void {
  if (!canUseDOM()) return;

  if (preference) {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } else {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  }
}

export function setStoredThemeAccentPreference(preference: ThemeAccent | null): void {
  if (!canUseDOM()) return;

  if (preference) {
    window.localStorage.setItem(THEME_ACCENT_STORAGE_KEY, preference);
  } else {
    window.localStorage.removeItem(THEME_ACCENT_STORAGE_KEY);
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
      accent: 'rgb(88, 166, 255)',
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
    accent: rgb(readRgb('--terminal-accent-rgb', '88 166 255')),
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
  const [accentPreference, setAccentPreferenceState] = useState<ThemeAccent | null>(() => getStoredThemeAccentPreference());
  const [accent, setAccent] = useState<ThemeAccent>(() => resolveThemeAccent(getStoredThemeAccentPreference()));

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextDetail = (event as CustomEvent<ThemeChangeDetail>).detail;
      const nextMode = nextDetail?.mode ?? resolveThemeMode(getStoredThemePreference());
      const nextAccent = nextDetail?.accent ?? resolveThemeAccent(getStoredThemeAccentPreference());
      setMode(nextMode);
      setAccent(nextAccent);
      setPreference(getStoredThemePreference());
      setAccentPreferenceState(getStoredThemeAccentPreference());
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  useEffect(() => {
    const nextMode = resolveThemeMode(preference);
    setMode(nextMode);
    applyThemeMode(nextMode);
  }, [preference]);

  useEffect(() => {
    const nextAccent = resolveThemeAccent(accentPreference);
    setAccent(nextAccent);
    applyThemeAccent(nextAccent);
  }, [accentPreference]);

  const setThemePreference = (nextPreference: ThemeMode | null) => {
    setStoredThemePreference(nextPreference);
    setPreference(nextPreference);
  };

  const setAccentPreference = (nextPreference: ThemeAccent | null) => {
    setStoredThemeAccentPreference(nextPreference);
    setAccentPreferenceState(nextPreference);
  };

  const toggleTheme = () => {
    setThemePreference(mode === 'dark' ? 'light' : 'dark');
  };

  const toggleAccent = () => {
    setAccentPreference(accent === 'yellow' ? null : 'yellow');
  };

  return {
    mode,
    preference,
    isDefaultTheme: preference === null,
    accent,
    accentPreference,
    isDefaultAccent: accentPreference === null,
    setThemePreference,
    setAccentPreference,
    toggleTheme,
    toggleAccent,
  };
}
