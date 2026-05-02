/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1a2e5a',
          light: '#4a90d9',
        },
      },
    },
  },
  plugins: [],
}
