export const getCategoryColor = (color: string) => {
  const colorMap: Record<string, string> = {
    RED: 'bg-dynamic-red',
    BLUE: 'bg-dynamic-blue',
    GREEN: 'bg-dynamic-green',
    YELLOW: 'bg-dynamic-yellow',
    ORANGE: 'bg-dynamic-orange',
    PURPLE: 'bg-dynamic-purple',
    PINK: 'bg-dynamic-pink',
    INDIGO: 'bg-dynamic-indigo',
    CYAN: 'bg-dynamic-cyan',
    GRAY: 'bg-dynamic-gray',
  };

  return colorMap[color] ?? 'bg-dynamic-blue';
};

export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};
