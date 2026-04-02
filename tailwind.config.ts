import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F7F6F3',
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#F7F6F3',
          3: '#F0EEE9',
        },
        border: '#E8E6E0',
        text: {
          primary: '#1A1917',
          muted: '#6B6860',
        },
        brand: {
          green: '#0F6E56',
          'green-bg': '#E1F5EE',
          'green-chart': '#1D9E75',
          red: '#993C1D',
          'red-bg': '#FAECE7',
          'red-chart': '#D85A30',
          blue: '#185FA5',
          'blue-chart': '#378ADD',
          amber: '#BA7517',
          'amber-chart': '#EF9F27',
          purple: '#6B3FA0',
          'purple-bg': '#F0E8FA',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        modal: '0 8px 32px rgba(0,0,0,0.12)',
        chart: '0 2px 8px rgba(0,0,0,0.08)',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.06em' }],
        xs: ['11px', { lineHeight: '16px', letterSpacing: '0.05em' }],
        sm: ['12px', { lineHeight: '18px' }],
        base: ['13px', { lineHeight: '20px' }],
        md: ['14px', { lineHeight: '22px' }],
        lg: ['15px', { lineHeight: '24px' }],
        xl: ['17px', { lineHeight: '26px' }],
        '2xl': ['20px', { lineHeight: '30px' }],
        '3xl': ['24px', { lineHeight: '34px' }],
      },
    },
  },
  plugins: [],
}

export default config
