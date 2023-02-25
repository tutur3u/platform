/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
    screens: {
      sm: '480px',
      tablet: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },
  darkMode: true,
  variants: {
    width: ['responsive', 'hover', 'focus'],
  },
  plugins: [require('tailwind-scrollbar'), require('@tailwindcss/line-clamp')],
};
