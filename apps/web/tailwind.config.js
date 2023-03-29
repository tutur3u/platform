/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: true,
  variants: {
    width: ['responsive', 'hover', 'focus'],
  },
  plugins: [require('tailwind-scrollbar'), require('tailwindcss-themer')],
};
