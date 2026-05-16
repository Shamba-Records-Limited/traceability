import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shamba palette — earthy, agricultural, professional.
        soil: {
          50: '#FAF6F0',
          100: '#F2EAD9',
          200: '#E5D2B0',
          300: '#D2B385',
          400: '#B98B58',
          500: '#9D6A3A',
          600: '#7D502B',
          700: '#5C3A1F',
          800: '#3E2614',
          900: '#23150B',
        },
        leaf: {
          50: '#F2F8F0',
          100: '#DDEED9',
          200: '#B5D9AC',
          300: '#85BE78',
          400: '#5BA04A',
          500: '#3E8530',
          600: '#2E6824',
          700: '#234E1B',
          800: '#163212',
          900: '#0A1A09',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
