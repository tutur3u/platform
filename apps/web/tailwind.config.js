/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
    screens: {
      tablet: '640px',
      // => @media (min-width: 640px) { ... }
    },
  },
  darkMode: true,
  variants: {
    width: ['responsive', 'hover', 'focus'],
  },
  plugins: [require('tailwind-scrollbar'), require('@tailwindcss/line-clamp')],
};
