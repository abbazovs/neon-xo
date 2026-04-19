/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Electric blue + magenta cyberpunk palette
        bg: {
          DEFAULT: '#05010f',
          soft: '#0a0518',
          card: 'rgba(15, 8, 40, 0.72)',
        },
        cyan: {
          neon: '#00f0ff',
          glow: '#4dffff',
        },
        magenta: {
          neon: '#ff2bd1',
          glow: '#ff6be0',
        },
        violet: {
          deep: '#2a0e6e',
        },
        ink: {
          DEFAULT: '#e4e1ff',
          dim: '#8c86b8',
          faint: '#5a5480',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'ui-sans-serif', 'system-ui'],
        body: ['Rajdhani', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        'neon-cyan': '0 0 12px #00f0ff, 0 0 24px rgba(0,240,255,0.5)',
        'neon-magenta': '0 0 12px #ff2bd1, 0 0 24px rgba(255,43,209,0.5)',
        'neon-soft': '0 0 20px rgba(0,240,255,0.15)',
      },
      dropShadow: {
        'neon-cyan': '0 0 6px #00f0ff',
        'neon-magenta': '0 0 6px #ff2bd1',
      },
      backgroundImage: {
        grid:
          'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        scanlines:
          'repeating-linear-gradient(180deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)',
      },
      animation: {
        'pulse-neon': 'pulseNeon 2.2s ease-in-out infinite',
        'flicker': 'flicker 3s linear infinite',
        'spin-slow': 'spin 4s linear infinite',
      },
      keyframes: {
        pulseNeon: {
          '0%, 100%': { filter: 'drop-shadow(0 0 4px currentColor)' },
          '50%': { filter: 'drop-shadow(0 0 12px currentColor) drop-shadow(0 0 20px currentColor)' },
        },
        flicker: {
          '0%, 19%, 21%, 49%, 51%, 100%': { opacity: '1' },
          '20%, 50%': { opacity: '0.82' },
        },
      },
    },
  },
  plugins: [],
};
