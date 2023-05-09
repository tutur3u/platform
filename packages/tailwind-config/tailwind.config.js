import { blue, red } from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export const darkMode = true;

export const content = [
  // app content
  `src/**/*.{js,ts,jsx,tsx}`,
  // include packages if not transpiling
  // "../../packages/**/*.{js,ts,jsx,tsx}",
];

export const variants = {
  height: ['responsive', 'hover', 'focus'],
  width: ['responsive', 'hover', 'focus'],
};

export const theme = {
  extend: {
    colors: {
      brandblue: blue[500],
      brandred: red[500],
    },
  },
};

export const plugins = [
  require('tailwind-scrollbar'),
  require('tailwindcss-themer'),
];
