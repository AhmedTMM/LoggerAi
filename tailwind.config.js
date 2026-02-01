/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // darkMode disabled - light mode only
  theme: {
    extend: {
      colors: {
        aviation: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dfff',
          300: '#7cc5ff',
          400: '#36a8ff',
          500: '#0c8fff',
          600: '#006fdf',
          700: '#0058b4',
          800: '#054a94',
          900: '#0a3f7a',
          950: '#072751',
        },
        status: {
          go: '#10b981',
          caution: '#f59e0b',
          nogo: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}
