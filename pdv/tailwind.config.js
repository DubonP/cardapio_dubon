/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#24348B',
          dark: '#1a2665',
          light: '#3d4fa8',
        },
      },
    },
  },
  plugins: [],
}
