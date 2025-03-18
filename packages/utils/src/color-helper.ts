export const getEventStyles = (
  color: string
): {
  bg: string;
  border: string;
  text: string;
  dragBg: string;
  syncingBg: string;
  successBg: string;
  errorBg: string;
} => {
  const colorStyles = {
    BLUE: {
      bg: 'bg-calendar-bg-blue hover:ring-dynamic-light-blue/80',
      border: 'border-dynamic-light-blue/80',
      text: 'text-dynamic-light-blue',
      dragBg: 'bg-calendar-bg-blue/70',
      syncingBg: 'bg-calendar-bg-blue',
      successBg: 'bg-calendar-bg-blue/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    RED: {
      bg: 'bg-calendar-bg-red hover:ring-dynamic-light-red/80',
      border: 'border-dynamic-light-red/80',
      text: 'text-dynamic-light-red',
      dragBg: 'bg-calendar-bg-red/70',
      syncingBg: 'bg-calendar-bg-red',
      successBg: 'bg-calendar-bg-red/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    GREEN: {
      bg: 'bg-calendar-bg-green hover:ring-dynamic-light-green/80',
      border: 'border-dynamic-light-green/80',
      text: 'text-dynamic-light-green',
      dragBg: 'bg-calendar-bg-green/70',
      syncingBg: 'bg-calendar-bg-green',
      successBg: 'bg-calendar-bg-green/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    YELLOW: {
      bg: 'bg-calendar-bg-yellow hover:ring-dynamic-light-yellow/80',
      border: 'border-dynamic-light-yellow/80',
      text: 'text-dynamic-light-yellow',
      dragBg: 'bg-calendar-bg-yellow/70',
      syncingBg: 'bg-calendar-bg-yellow',
      successBg: 'bg-calendar-bg-yellow/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    PURPLE: {
      bg: 'bg-calendar-bg-purple hover:ring-dynamic-light-purple/80',
      border: 'border-dynamic-light-purple/80',
      text: 'text-dynamic-light-purple',
      dragBg: 'bg-calendar-bg-purple/70',
      syncingBg: 'bg-calendar-bg-purple',
      successBg: 'bg-calendar-bg-purple/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    PINK: {
      bg: 'bg-calendar-bg-pink hover:ring-dynamic-light-pink/80',
      border: 'border-dynamic-light-pink/80',
      text: 'text-dynamic-light-pink',
      dragBg: 'bg-calendar-bg-pink/70',
      syncingBg: 'bg-calendar-bg-pink',
      successBg: 'bg-calendar-bg-pink/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    ORANGE: {
      bg: 'bg-calendar-bg-orange hover:ring-dynamic-light-orange/80',
      border: 'border-dynamic-light-orange/80',
      text: 'text-dynamic-light-orange',
      dragBg: 'bg-calendar-bg-orange/70',
      syncingBg: 'bg-calendar-bg-orange',
      successBg: 'bg-calendar-bg-orange/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    INDIGO: {
      bg: 'bg-calendar-bg-indigo hover:ring-dynamic-light-indigo/80',
      border: 'border-dynamic-light-indigo/80',
      text: 'text-dynamic-light-indigo',
      dragBg: 'bg-calendar-bg-indigo/70',
      syncingBg: 'bg-calendar-bg-indigo',
      successBg: 'bg-calendar-bg-indigo/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    CYAN: {
      bg: 'bg-calendar-bg-cyan hover:ring-dynamic-light-cyan/80',
      border: 'border-dynamic-light-cyan/80',
      text: 'text-dynamic-light-cyan',
      dragBg: 'bg-calendar-bg-cyan/70',
      syncingBg: 'bg-calendar-bg-cyan',
      successBg: 'bg-calendar-bg-cyan/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
    GRAY: {
      bg: 'bg-calendar-bg-gray hover:ring-dynamic-light-gray/80',
      border: 'border-dynamic-light-gray/80',
      text: 'text-dynamic-light-gray',
      dragBg: 'bg-calendar-bg-gray/70',
      syncingBg: 'bg-calendar-bg-gray',
      successBg: 'bg-calendar-bg-gray/90 transition-colors duration-300',
      errorBg: 'bg-red-100 transition-colors duration-300',
    },
  } as const;

  const normalizedColor = color.toUpperCase();
  const colorStyle = colorStyles[normalizedColor as keyof typeof colorStyles];

  if (!colorStyle) return colorStyles.BLUE;
  return colorStyle;
};
