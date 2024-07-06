// types.ts
export const BOARD_SIZE = 8;
export const PTS_PER_FRUIT = 10;

export const FRUIT_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
] as const;

export const FRUIT_TYPES = [
  'normal',
  'vertical',
  'horizontal',
  'explosive',
  'rainbow',
] as const;

export type FruitColor = (typeof FRUIT_COLORS)[number];
export type FruitType = (typeof FRUIT_TYPES)[number];

export type Fruit =
  | {
      color: FruitColor;
      type: FruitType;
    }
  | undefined;

export const colorMap: Record<FruitColor, string> = {
  red: '#E63946',
  blue: '#457B9D',
  green: '#2A9D8F',
  yellow: '#FFD700',
  purple: '#9C89B8',
  orange: '#F77F00',
};
