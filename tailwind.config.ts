import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b1020',
        panel: '#121a33',
        accent: '#ffd166',
        accent2: '#06d6a0',
        danger: '#ef476f'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255, 209, 102, 0.15), 0 18px 60px rgba(0, 0, 0, 0.35)'
      }
    }
  },
  plugins: []
};

export default config;
