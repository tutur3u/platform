const defaultColor = 'blue';

export const getTextColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'text-red-200',
    blue: 'text-blue-200',
    green: 'text-green-200',
    yellow: 'text-yellow-200',
    orange: 'text-orange-200',
    purple: 'text-purple-200',
    pink: 'text-pink-200',
    indigo: 'text-indigo-200',
    cyan: 'text-cyan-200',
    gray: 'text-gray-200',
  };

  return colors?.[color] || colors[defaultColor]!;
};

export const getBackgroundColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'bg-red-300/20',
    blue: 'bg-blue-300/20',
    green: 'bg-green-300/20',
    yellow: 'bg-yellow-300/20',
    orange: 'bg-orange-300/20',
    purple: 'bg-purple-300/20',
    pink: 'bg-pink-300/20',
    indigo: 'bg-indigo-300/20',
    cyan: 'bg-cyan-300/20',
    gray: 'bg-gray-300/20',
  };

  return colors?.[color] || colors[defaultColor]!;
};

export const getShadowColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'shadow-red-300/20',
    blue: 'shadow-blue-300/20',
    green: 'shadow-green-300/20',
    yellow: 'shadow-yellow-300/20',
    orange: 'shadow-orange-300/20',
    purple: 'shadow-purple-300/20',
    pink: 'shadow-pink-300/20',
    indigo: 'shadow-indigo-300/20',
    cyan: 'shadow-cyan-300/20',
    gray: 'shadow-gray-300/20',
  };

  return colors?.[color] || colors[defaultColor]!;
};

export const getBorderColor = (color = defaultColor): string => {
  const colors: Record<string, string> = {
    red: 'border-red-300',
    blue: 'border-blue-300',
    green: 'border-green-300',
    yellow: 'border-yellow-300',
    orange: 'border-orange-300',
    purple: 'border-purple-300',
    pink: 'border-pink-300',
    indigo: 'border-indigo-300',
    cyan: 'border-cyan-300',
    gray: 'border-gray-300',
  };

  return colors?.[color] || colors[defaultColor]!;
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
      return 'border-green-500/20 bg-green-500/10 dark:border-green-300/10 dark:bg-green-300/10 text-green-600 dark:text-green-300';

    case 'member':
      return 'border-blue-500/20 bg-blue-500/10 dark:border-blue-300/10 dark:bg-blue-300/10 text-blue-600 dark:text-blue-300';

    case 'admin':
      return 'border-orange-500/20 bg-orange-500/10 dark:border-orange-300/10 dark:bg-orange-300/10 text-orange-600 dark:text-orange-300';

    case 'owner':
      return 'border-purple-500/20 bg-purple-500/10 dark:border-purple-300/10 dark:bg-purple-300/10 text-purple-600 dark:text-purple-300';

    default:
      return 'border-zinc-500/80 bg-zinc-500/10 dark:border-zinc-800/80 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400';
  }
};
