const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
/** Color backed by a `--name` CSS variable holding RGB channels ("r g b"), alpha-aware */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
const scale = (name) => Object.fromEntries(SHADES.map((s) => [s, v(`${name}-${s}`)]))

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/src/**/*.{ts,tsx}",
    "./index.html",
  ],
  darkMode: 'class',
  // Content-type badge shades derived at runtime for media overlays (DramaProjectList)
  safelist: [{ pattern: /^text-(amber|emerald|sky|rose|purple|pink|teal|cyan|violet)-400$/ }],
  theme: {
    extend: {
      // Every color reads a CSS variable (RGB channels) defined per theme in src/renderer/src/index.css,
      // so the same utilities render in light and dark. See DESIGN.md.
      colors: {
        surface: scale('surface'),
        // Monochrome "ink" scale (no indigo): solid fills are the primary surface, text shades are ink
        accent: scale('accent'),
        canvas: v('canvas'),
        // `ink` doubles as the tint color (`bg-ink/5`, `border-ink/10`) that replaces white-on-dark overlays
        ink: {
          DEFAULT: v('ink'),
          muted: v('ink-muted'),
          subtle: v('ink-subtle'),
        },
        hairline: {
          DEFAULT: v('hairline'),
          soft: v('hairline-soft'),
        },
        'surface-soft': v('surface-soft'),
        popover: v('popover'),
        'on-accent': v('on-accent'),
        overlay: v('overlay'),
        block: {
          lime: v('block-lime'),
          lilac: v('block-lilac'),
          cream: v('block-cream'),
          mint: v('block-mint'),
          pink: v('block-pink'),
          coral: v('block-coral'),
          navy: v('block-navy'),
          'lime-ink': v('block-lime-ink'),
          'lilac-ink': v('block-lilac-ink'),
          'cream-ink': v('block-cream-ink'),
          'mint-ink': v('block-mint-ink'),
          'pink-ink': v('block-pink-ink'),
          'coral-ink': v('block-coral-ink'),
          'navy-ink': v('block-navy-ink'),
        },
        magenta: v('accent-magenta'),
        // shadcn theme tokens ─ mapped to the tokens above
        background: v('canvas'),
        foreground: v('ink'),
        primary: {
          DEFAULT: v('accent-600'),
          foreground: v('on-accent'),
        },
        secondary: {
          DEFAULT: v('surface-800'),
          foreground: v('ink'),
        },
        muted: {
          DEFAULT: v('surface-900'),
          foreground: v('ink-muted'),
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        border: v('surface-700'),
        input: v('surface-700'),
        ring: v('accent-500'),
        sidebar: {
          DEFAULT: v('surface-950'),
          foreground: v('ink'),
          primary: v('accent-600'),
          'primary-foreground': v('on-accent'),
          accent: v('surface-800'),
          'accent-foreground': v('ink'),
          border: v('surface-800'),
          ring: v('accent-500'),
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // App-scale type tokens (DESIGN.md principles: weight carries hierarchy, tight tracking on titles)
        title: ['15px', { lineHeight: '1.35', letterSpacing: '-0.2px', fontWeight: '540' }],
        'title-lg': ['20px', { lineHeight: '1.25', letterSpacing: '-0.4px', fontWeight: '540' }],
        body: ['13px', { lineHeight: '1.45', letterSpacing: '-0.05px' }],
        meta: ['11px', { lineHeight: '1.35' }],
        eyebrow: ['10px', { lineHeight: '1.2', letterSpacing: '0.6px' }],
      },
      fontWeight: {
        book: '330',
        regular: '400',
        emphasis: '480',
        strong: '540',
      },
      borderRadius: {
        pill: '9999px',
        block: '24px',
      },
      boxShadow: {
        soft: '0 4px 16px rgb(0 0 0 / 0.06)',
        float: '0 8px 30px rgb(0 0 0 / 0.18)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
