const defaultColor = 'blue';

export const getTextColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'text-dynamic-red',
    blue: 'text-dynamic-blue',
    green: 'text-dynamic-green',
    yellow: 'text-dynamic-yellow',
    orange: 'text-dynamic-orange',
    purple: 'text-dynamic-purple',
    pink: 'text-dynamic-pink',
    indigo: 'text-dynamic-indigo',
    cyan: 'text-dynamic-cyan',
    gray: 'text-dynamic-gray',
  };

  return colors?.[color] || colors[defaultColor] || 'text-dynamic-gray';
};

export const getBackgroundColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'bg-dynamic-red/20',
    blue: 'bg-dynamic-blue/20',
    green: 'bg-dynamic-green/20',
    yellow: 'bg-dynamic-yellow/20',
    orange: 'bg-dynamic-orange/20',
    purple: 'bg-dynamic-purple/20',
    pink: 'bg-dynamic-pink/20',
    indigo: 'bg-dynamic-indigo/20',
    cyan: 'bg-dynamic-cyan/20',
    gray: 'bg-dynamic-gray/20',
  };

  return colors?.[color] || colors[defaultColor] || 'bg-dynamic-gray';
};

export const getShadowColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'shadow-dynamic-red/20',
    blue: 'shadow-dynamic-blue/20',
    green: 'shadow-dynamic-green/20',
    yellow: 'shadow-dynamic-yellow/20',
    orange: 'shadow-dynamic-orange/20',
    purple: 'shadow-dynamic-purple/20',
    pink: 'shadow-dynamic-pink/20',
    indigo: 'shadow-dynamic-indigo/20',
    cyan: 'shadow-dynamic-cyan/20',
    gray: 'shadow-dynamic-gray/20',
  };

  return colors?.[color] || colors[defaultColor] || 'ring-dynamic-gray';
};

export const getBorderColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'border-dynamic-red',
    blue: 'border-dynamic-blue',
    green: 'border-dynamic-green',
    yellow: 'border-dynamic-yellow',
    orange: 'border-dynamic-orange',
    purple: 'border-dynamic-purple',
    pink: 'border-dynamic-pink',
    indigo: 'border-dynamic-indigo',
    cyan: 'border-dynamic-cyan',
    gray: 'border-dynamic-gray',
  };

  return colors?.[color] || colors[defaultColor] || 'border-dynamic-gray';
};

export const getCardColor = (color = defaultColor): string => {
  const backgroundColor = getBackgroundColor(color);
  const borderColor = getBorderColor(color);
  const shadowColor = getShadowColor(color);
  const textColor = getTextColor(color);

  return `${backgroundColor} ${borderColor} ${shadowColor} ${textColor}`;
};

export const getRoleColor = (role: string): string => {
  switch (role) {
    case 'you':
      return 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green';

    case 'member':
      return 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue';

    case 'admin':
      return 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange';

    case 'owner':
      return 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple';

    default:
      return 'border-dynamic-gray/80 bg-dynamic-gray/10 text-dynamic-gray';
  }
};

export const getRingColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'ring-dynamic-red',
    blue: 'ring-dynamic-blue',
    green: 'ring-dynamic-green',
    yellow: 'ring-dynamic-yellow',
    orange: 'ring-dynamic-orange',
    purple: 'ring-dynamic-purple',
    pink: 'ring-dynamic-pink',
    indigo: 'ring-dynamic-indigo',
    cyan: 'ring-dynamic-cyan',
    gray: 'ring-dynamic-gray',
  };

  return colors?.[color] || colors[defaultColor] || 'ring-dynamic-gray';
};
