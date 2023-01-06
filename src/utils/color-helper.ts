const defaultColor = 'blue';

export const getTextColor = (color = defaultColor) => {
  const colors: {
    [key: string]: string;
  } = {
    red: `text-red-200`,
    blue: `text-blue-200`,
    green: `text-green-200`,
    yellow: `text-yellow-200`,
    orange: `text-orange-200`,
    purple: `text-purple-200`,
    pink: `text-pink-200`,
    indigo: `text-indigo-200`,
    cyan: `text-cyan-200`,
    gray: `text-gray-200`,
  };

  return colors[color];
};

export const getBackgroundColor = (color = defaultColor) => {
  const colors: {
    [key: string]: string;
  } = {
    red: `bg-red-300/20`,
    blue: `bg-blue-300/20`,
    green: `bg-green-300/20`,
    yellow: `bg-yellow-300/20`,
    orange: `bg-orange-300/20`,
    purple: `bg-purple-300/20`,
    pink: `bg-pink-300/20`,
    indigo: `bg-indigo-300/20`,
    cyan: `bg-cyan-300/20`,
    gray: `bg-gray-300/20`,
  };

  return colors[color];
};

export const getShadowColor = (color = defaultColor) => {
  const colors: {
    [key: string]: string;
  } = {
    red: `shadow-red-300/20`,
    blue: `shadow-blue-300/20`,
    green: `shadow-green-300/20`,
    yellow: `shadow-yellow-300/20`,
    orange: `shadow-orange-300/20`,
    purple: `shadow-purple-300/20`,
    pink: `shadow-pink-300/20`,
    indigo: `shadow-indigo-300/20`,
    cyan: `shadow-cyan-300/20`,
    gray: `shadow-gray-300/20`,
  };

  return colors[color];
};

export const getBorderColor = (color = defaultColor) => {
  const colors: {
    [key: string]: string;
  } = {
    red: `border-red-300`,
    blue: `border-blue-300`,
    green: `border-green-300`,
    yellow: `border-yellow-300`,
    orange: `border-orange-300`,
    purple: `border-purple-300`,
    pink: `border-pink-300`,
    indigo: `border-indigo-300`,
    cyan: `border-cyan-300`,
    gray: `border-gray-300`,
  };

  return colors[color];
};

export const getCardColor = (color = defaultColor) => {
  const backgroundColor = getBackgroundColor(color);
  const borderColor = getBorderColor(color);
  const shadowColor = getShadowColor(color);
  const textColor = getTextColor(color);

  return `${backgroundColor} ${borderColor} ${shadowColor} ${textColor}`;
};
