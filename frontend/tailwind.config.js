/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core palette — GridIntel Dark Navy
        navy: {
          bg:      '#001B2A', // Page background — deepest navy
          surface: '#112240', // Sidebar, nav surfaces
          card:    '#1A2B45', // Cards, popups, modals
          border:  '#1E3A5F', // Subtle borders
          hover:   '#243B55', // Hover states on surfaces
        },
        cyan: {
          DEFAULT: '#00D4FF',
          light:   '#33DDFF',
          dim:     '#00A8CC',
          glow:    'rgba(0,212,255,0.15)',
        },
        text: {
          primary:   '#F4F6F9',
          secondary: '#8892B0',
          muted:     '#4A5568',
          inverse:   '#001B2A',
        },
        // Status colors
        status: {
          success: '#10B981',
          warning: '#F59E0B',
          error:   '#EF4444',
          info:    '#3B82F6',
          draft:   '#6B7280',
          locked:  '#8B5CF6',
        },
        // Recharts / chart palette
        chart: {
          1: '#00D4FF',
          2: '#10B981',
          3: '#F59E0B',
          4: '#8B5CF6',
          5: '#EF4444',
          6: '#3B82F6',
          7: '#EC4899',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        sidebar: '260px',
        topbar:  '60px',
      },
      borderRadius: {
        sm:  '4px',
        DEFAULT: '6px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
      },
      boxShadow: {
        card:    '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        panel:   '0 4px 24px rgba(0,0,0,0.5)',
        cyan:    '0 0 20px rgba(0,212,255,0.2)',
        'cyan-sm': '0 0 10px rgba(0,212,255,0.15)',
        inner:   'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern':    "url(\"data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 0h1v40H0zM0 0h40v1H0z' fill='rgba(255,255,255,0.03)'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-in':      'fadeIn 0.2s ease-out',
        'slide-in':     'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-out':    'slideOut 0.25s cubic-bezier(0.4,0,1,1)',
        'pulse-cyan':   'pulseCyan 2s ease-in-out infinite',
        'spin-slow':    'spin 3s linear infinite',
        'blink':        'blink 1s step-end infinite',
        'shimmer':      'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        slideOut: {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(100%)' },
        },
        pulseCyan: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,212,255,0)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(0,212,255,0.15)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      transitionTimingFunction: {
        'bounce-out': 'cubic-bezier(0.34,1.56,0.64,1)',
      },
    },
  },
  plugins: [],
};
