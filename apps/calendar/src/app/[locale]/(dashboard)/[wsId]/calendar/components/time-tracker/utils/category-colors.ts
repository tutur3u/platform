/**
 * Get the background color class for a category based on its color name
 * Uses dynamic color tokens for theme consistency
 */
export function getCategoryColor(color: string): string {
  const colorMap: Record<string, string> = {
    RED: 'bg-dynamic-red/80',
    BLUE: 'bg-dynamic-blue/80',
    GREEN: 'bg-dynamic-green/80',
    YELLOW: 'bg-dynamic-yellow/80',
    ORANGE: 'bg-dynamic-orange/80',
    PURPLE: 'bg-dynamic-purple/80',
    PINK: 'bg-dynamic-pink/80',
    INDIGO: 'bg-dynamic-indigo/80',
    CYAN: 'bg-dynamic-cyan/80',
    GRAY: 'bg-dynamic-gray/80',
  };
  return colorMap[color] || 'bg-dynamic-blue/80';
}

/**
 * Get just the color name without opacity for borders, etc.
 */
export function getCategoryColorName(color: string): string {
  const colorMap: Record<string, string> = {
    RED: 'dynamic-red',
    BLUE: 'dynamic-blue',
    GREEN: 'dynamic-green',
    YELLOW: 'dynamic-yellow',
    ORANGE: 'dynamic-orange',
    PURPLE: 'dynamic-purple',
    PINK: 'dynamic-pink',
    INDIGO: 'dynamic-indigo',
    CYAN: 'dynamic-cyan',
    GRAY: 'dynamic-gray',
  };
  return colorMap[color] || 'dynamic-blue';
}
