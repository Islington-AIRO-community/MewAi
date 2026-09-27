import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1440px' },
    },
    extend: {
      spacing: {
        4.5: '1.125rem',
        5.5: '1.375rem',
        13: '3.25rem',
      },
      colors: {
        /* ---- Brand: Deep slate / navy ---- */
        navy: {
          50: '#F1F5F9',
          100: '#E2E8F0',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#64748B',
          500: '#475569',
          600: '#334155',
          700: '#1E293B',
          800: '#131E31',
          900: '#0F172A',
          950: '#080D19',
        },
        /* ---- Emergency accent: high-visibility rose ---- */
        emergency: {
          50: '#FFF1F4',
          100: '#FFE1E8',
          200: '#FFC9D5',
          300: '#FFA3B9',
          400: '#FD6F92',
          500: '#E11D48',
          600: '#C8133C',
          700: '#A80F32',
          800: '#8C1029',
          900: '#781428',
        },
        /* ---- Alert / caution: amber ---- */
        alert: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#D97706',
          600: '#B45309',
          700: '#92400E',
          800: '#78350F',
          900: '#651F0B',
        },
        /* ---- Relief: calm teal for resolved / success ---- */
        relief: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        /* ---- Info / dispatch: azure ---- */
        dispatch: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        surface: '#F8FAFC',
        ink: '#020617',
      },
      fontFamily: {
        sans: [
          'Inter',
          'Inter var',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        /* Slightly larger base scale for readability under stress */
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 16px -2px rgb(15 23 42 / 0.08)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 12px 32px -8px rgb(15 23 42 / 0.12)',
        lift: '0 2px 4px 0 rgb(15 23 42 / 0.05), 0 24px 48px -12px rgb(15 23 42 / 0.18)',
        'glow-rose': '0 0 0 1px rgb(225 29 72 / 0.25), 0 12px 40px -8px rgb(225 29 72 / 0.45)',
      },
      /* Only `pulse-ring` and `slide-up` have call sites. The other five were
         defined here and never used, which is why they are gone rather than
         merely unused — nothing referenced them. */
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        'slide-up': 'slide-up 0.24s ease-out both',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
