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
      dragBg: 'bg-calendar-bg-blue',
      syncingBg: 'bg-calendar-bg-blue',
      successBg: 'bg-calendar-bg-blue',
      errorBg: 'bg-calendar-bg-red',
    },
    RED: {
      bg: 'bg-calendar-bg-red hover:ring-dynamic-light-red/80',
      border: 'border-dynamic-light-red/80',
      text: 'text-dynamic-light-red',
      dragBg: 'bg-calendar-bg-red',
      syncingBg: 'bg-calendar-bg-red',
      successBg: 'bg-calendar-bg-red',
      errorBg: 'bg-calendar-bg-red',
    },
    GREEN: {
      bg: 'bg-calendar-bg-green hover:ring-dynamic-light-green/80',
      border: 'border-dynamic-light-green/80',
      text: 'text-dynamic-light-green',
      dragBg: 'bg-calendar-bg-green',
      syncingBg: 'bg-calendar-bg-green',
      successBg: 'bg-calendar-bg-green',
      errorBg: 'bg-calendar-bg-red',
    },
    YELLOW: {
      bg: 'bg-calendar-bg-yellow hover:ring-dynamic-light-yellow/80',
      border: 'border-dynamic-light-yellow/80',
      text: 'text-dynamic-light-yellow',
      dragBg: 'bg-calendar-bg-yellow',
      syncingBg: 'bg-calendar-bg-yellow',
      successBg: 'bg-calendar-bg-yellow',
      errorBg: 'bg-calendar-bg-red',
    },
    PURPLE: {
      bg: 'bg-calendar-bg-purple hover:ring-dynamic-light-purple/80',
      border: 'border-dynamic-light-purple/80',
      text: 'text-dynamic-light-purple',
      dragBg: 'bg-calendar-bg-purple',
      syncingBg: 'bg-calendar-bg-purple',
      successBg: 'bg-calendar-bg-purple',
      errorBg: 'bg-calendar-bg-red',
    },
    PINK: {
      bg: 'bg-calendar-bg-pink hover:ring-dynamic-light-pink/80',
      border: 'border-dynamic-light-pink/80',
      text: 'text-dynamic-light-pink',
      dragBg: 'bg-calendar-bg-pink',
      syncingBg: 'bg-calendar-bg-pink',
      successBg: 'bg-calendar-bg-pink',
      errorBg: 'bg-calendar-bg-red',
    },
    ORANGE: {
      bg: 'bg-calendar-bg-orange hover:ring-dynamic-light-orange/80',
      border: 'border-dynamic-light-orange/80',
      text: 'text-dynamic-light-orange',
      dragBg: 'bg-calendar-bg-orange',
      syncingBg: 'bg-calendar-bg-orange',
      successBg: 'bg-calendar-bg-orange',
      errorBg: 'bg-calendar-bg-red',
    },
    INDIGO: {
      bg: 'bg-calendar-bg-indigo hover:ring-dynamic-light-indigo/80',
      border: 'border-dynamic-light-indigo/80',
      text: 'text-dynamic-light-indigo',
      dragBg: 'bg-calendar-bg-indigo',
      syncingBg: 'bg-calendar-bg-indigo',
      successBg: 'bg-calendar-bg-indigo',
      errorBg: 'bg-calendar-bg-red',
    },
    CYAN: {
      bg: 'bg-calendar-bg-cyan hover:ring-dynamic-light-cyan/80',
      border: 'border-dynamic-light-cyan/80',
      text: 'text-dynamic-light-cyan',
      dragBg: 'bg-calendar-bg-cyan',
      syncingBg: 'bg-calendar-bg-cyan',
      successBg: 'bg-calendar-bg-cyan',
      errorBg: 'bg-calendar-bg-red',
    },
    GRAY: {
      bg: 'bg-calendar-bg-gray hover:ring-dynamic-light-gray/80',
      border: 'border-dynamic-light-gray/80',
      text: 'text-dynamic-light-gray',
      dragBg: 'bg-calendar-bg-gray',
      syncingBg: 'bg-calendar-bg-gray',
      successBg: 'bg-calendar-bg-gray',
      errorBg: 'bg-calendar-bg-red',
    },
  } as const;

  const normalizedColor = color.toUpperCase();
  const colorStyle = colorStyles[normalizedColor as keyof typeof colorStyles];

  if (!colorStyle) return colorStyles.BLUE;
  return colorStyle;
};
