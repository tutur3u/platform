// types.ts
export const BOARD_SIZE = 8;
export const PTS_PER_FRUIT = 10;
const NULL_COLOR = 'var(--foreground)';

const FRUIT_COLORS = [
  { name: 'red', code: '#E63946' },
  { name: 'blue', code: '#457B9D' },
  { name: 'green', code: '#2A9D8F' },
  { name: 'yellow', code: '#FFD700' },
  { name: 'purple', code: '#9C89B8' },
  { name: 'orange', code: '#F77F00' },
  { name: 'null', code: NULL_COLOR },
] as const;

const FRUIT_TYPES = [
  'normal',
  'vertical',
  'horizontal',
  'plus',
  'explosive',
  'big-explosive',
  'rainbow',
] as const;

export type FruitColor = (typeof FRUIT_COLORS)[number];
export type FruitColorName = FruitColor['name'];
export type FruitColorCode = FruitColor['code'];
export type FruitType = (typeof FRUIT_TYPES)[number];

export const getRandomFruitColor = () =>
  FRUIT_COLORS[Math.floor(Math.random() * (FRUIT_COLORS.length - 1))]!;

export class Fruit {
  color: FruitColor;
  type: FruitType;

  constructor(color?: FruitColorName, type?: FruitType) {
    const colorIndex = color
      ? FRUIT_COLORS.findIndex((fruitColor) => fruitColor.name === color)
      : Math.floor(Math.random() * (FRUIT_COLORS.length - 1));

    this.color =
      type === 'rainbow'
        ? FRUIT_COLORS[FRUIT_COLORS.length - 1]!
        : FRUIT_COLORS[colorIndex]!;
    this.type = type ?? 'normal';
  }
}

export type Fruits = (Fruit | undefined)[];
