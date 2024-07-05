// types.ts
export const width = 8;

export const FruitColors = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'horizontalLineEraser',
  'verticalLineEraser',
] as const;
export type FruitColor = (typeof FruitColors)[number];

export const colorMap: Record<FruitColor, string> = {
  red: '#E63946',
  blue: '#457B9D',
  green: '#2A9D8F',
  yellow: '#FFD700',
  purple: '#9C89B8',
  orange: '#F77F00',
  horizontalLineEraser: '#333',
  verticalLineEraser: '#333',
};
