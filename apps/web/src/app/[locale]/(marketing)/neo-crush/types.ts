export const width = 8;

export const FruitColors = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'lineEraser',
] as const;
export type FruitColor = (typeof FruitColors)[number];

export const colorMap: Record<FruitColor, string> = {
  red: '#E63946',
  blue: '#457B9D',
  green: '#2A9D8F',
  yellow: '#FFD700',
  purple: '#9C89B8',
  orange: '#F77F00',
  lineEraser: '#333',
};
