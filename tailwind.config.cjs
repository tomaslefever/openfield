/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/src/**/*.{ts,tsx}",
    "./index.html",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#f6f6f7',
          100: '#e1e1e4',
          200: '#c3c3c9',
          300: '#9e9ea8',
          400: '#7a7a86',
          500: '#5f5f6c',
          600: '#4a4a55',
          700: '#3d3d46',
          800: '#34343b',
          900: '#2e2e34',
          950: '#0f0f12',
        },
        accent: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // shadcn theme tokens ─ mapped to project surface/accent
        background: '#0f0f12',
        foreground: '#e1e1e4',
        primary: {
          DEFAULT: '#4f46e5',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#34343b',
          foreground: '#e1e1e4',
        },
        muted: {
          DEFAULT: '#2e2e34',
          foreground: '#7a7a86',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        border: '#3d3d46',
        input: '#3d3d46',
        ring: '#4f46e5',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background) / <alpha-value>)',
          foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'hsl(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'hsl(var(--sidebar-border) / <alpha-value>)',
          ring: 'hsl(var(--sidebar-ring) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
