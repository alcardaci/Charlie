/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        terminal: {
          bg: 'rgb(var(--terminal-bg-rgb) / <alpha-value>)',
          panel: 'rgb(var(--terminal-panel-rgb) / <alpha-value>)',
          elevated: 'rgb(var(--terminal-elevated-rgb) / <alpha-value>)',
          hover: 'rgb(var(--terminal-hover-rgb) / <alpha-value>)',
          border: 'rgb(var(--terminal-border-rgb) / <alpha-value>)',
          accent: 'rgb(var(--terminal-accent-rgb) / <alpha-value>)',
          'on-accent': 'rgb(var(--terminal-on-accent-rgb) / <alpha-value>)',
          'accent-dim': 'rgb(var(--terminal-accent-rgb) / 0.15)',
          positive: 'rgb(var(--terminal-positive-rgb) / <alpha-value>)',
          'positive-dim': 'rgb(var(--terminal-positive-rgb) / 0.12)',
          negative: 'rgb(var(--terminal-negative-rgb) / <alpha-value>)',
          'negative-dim': 'rgb(var(--terminal-negative-rgb) / 0.12)',
          text: 'rgb(var(--terminal-text-rgb) / <alpha-value>)',
          muted: 'rgb(var(--terminal-muted-rgb) / <alpha-value>)',
          faint: 'rgb(var(--terminal-faint-rgb) / <alpha-value>)',
          blue: 'rgb(var(--terminal-blue-rgb) / <alpha-value>)',
          purple: 'rgb(var(--terminal-purple-rgb) / <alpha-value>)',
        },
      },
      animation: {
        ticker: 'ticker 40s linear infinite',
        blink: 'blink 1s step-end infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
