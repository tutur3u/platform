// types.ts
export const BOARD_SIZE = 7;
export const PTS_PER_FRUIT = 10;
const NULL_COLOR = 'var(--foreground)';

const FRUIT_COLORS = [
  { name: 'red', code: '#E63946', src: '/neo-crush/red.png' },
  // { name: 'blue', code: '#457B9D', src: '/neo-crush/blue.png' },
  { name: 'green', code: '#2A9D8F', src: '/neo-crush/green.png' },
  { name: 'yellow', code: '#FFD700', src: '/neo-crush/yellow.png' },
  { name: 'purple', code: '#9C89B8', src: '/neo-crush/purple.png' },
  { name: 'orange', code: '#F77F00', src: '/neo-crush/orange.png' },
  { name: 'null', code: NULL_COLOR, src: undefined },
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
export type FruitColorSrc = FruitColor['src'];
export type FruitType = (typeof FRUIT_TYPES)[number];

export const getRandomFruitColor = () =>
  FRUIT_COLORS[Math.floor(Math.random() * (FRUIT_COLORS.length - 1))]!;

export class Fruit {
  color: FruitColor;
  type: FruitType;
  src?: string;

  constructor(color?: FruitColorName, type?: FruitType, src?: string) {
    const colorIndex = color
      ? FRUIT_COLORS.findIndex((fruitColor) => fruitColor.name === color)
      : Math.floor(Math.random() * (FRUIT_COLORS.length - 1));

    this.color =
      type === 'rainbow'
        ? FRUIT_COLORS[FRUIT_COLORS.length - 1]!
        : FRUIT_COLORS[colorIndex]!;
    this.type = type ?? 'normal';
    this.src = src ?? this.color.src;
  }
}

export type Fruits = (Fruit | undefined)[];
