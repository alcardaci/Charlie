import { useSyncExternalStore } from 'react';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'bterminal-theme';
const THEME_CHANGE_EVENT = 'bterminal-themechange';

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
};

function currentMode(): ThemeMode {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function initializeThemeMode(): void {
  let mode: ThemeMode = 'dark';
  try {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') mode = 'light';
  } catch {
    // The theme switch still works when browser storage is unavailable.
  }
  applyMode(mode);
}

function toggleTheme(): void {
  const mode = currentMode() === 'dark' ? 'light' : 'dark';
  applyMode(mode);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Keep the selected mode for the current session.
  }
}

function subscribeToTheme(listener: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}

export function useTheme() {
  const mode = useSyncExternalStore(subscribeToTheme, currentMode, () => 'dark' as const);
  return { mode, toggleTheme };
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

  const styles = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const readRgb = (name: string, fallback: string) => styles?.getPropertyValue(name).trim() || fallback;

  return {
    bg: rgb(readRgb('--terminal-bg-rgb', '0 0 0')),
    panel: rgb(readRgb('--terminal-panel-rgb', '27 27 26')),
    elevated: rgb(readRgb('--terminal-elevated-rgb', '34 34 32')),
    hover: rgb(readRgb('--terminal-hover-rgb', '45 45 42')),
    border: rgb(readRgb('--terminal-border-rgb', '69 69 65')),
    accent: rgb(readRgb('--terminal-accent-rgb', '255 126 51')),
    positive: rgb(readRgb('--terminal-positive-rgb', '109 226 153')),
    negative: rgb(readRgb('--terminal-negative-rgb', '255 112 116')),
    text: rgb(readRgb('--terminal-text-rgb', '244 242 235')),
    muted: rgb(readRgb('--terminal-muted-rgb', '211 209 201')),
    faint: rgb(readRgb('--terminal-faint-rgb', '181 179 171')),
    blue: rgb(readRgb('--terminal-blue-rgb', '142 191 235')),
    purple: rgb(readRgb('--terminal-purple-rgb', '200 174 214')),
    chartGrid: rgb(readRgb('--terminal-chart-grid-rgb', '55 55 52')),
    positiveDim: rgba(readRgb('--terminal-positive-rgb', '109 226 153'), 0.70),
    negativeDim: rgba(readRgb('--terminal-negative-rgb', '255 112 116'), 0.70),
  };
}
