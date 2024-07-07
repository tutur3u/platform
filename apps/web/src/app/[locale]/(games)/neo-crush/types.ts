// types.ts
export const BOARD_SIZE = 8;
export const PTS_PER_FRUIT = 10;

const FRUIT_COLORS = [
  { name: 'red', code: '#E63946' },
  { name: 'blue', code: '#457B9D' },
  { name: 'green', code: '#2A9D8F' },
  { name: 'yellow', code: '#FFD700' },
  { name: 'purple', code: '#9C89B8' },
  { name: 'orange', code: '#F77F00' }
] as const;

const FRUIT_TYPES = [
  'normal',
  'vertical',
  'horizontal',
  'explosive',
  'rainbow',
] as const;

type FruitColor = (typeof FRUIT_COLORS)[number];
type FruitType = (typeof FRUIT_TYPES)[number];

export class Fruit {
  color: FruitColor | undefined;
  type: FruitType | undefined;

  constructor(name?: string, type?: string) {
    if (!name && !type) {
      this.color = FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)];
      this.type = 'normal';
    }
    else {
      this.color = FRUIT_COLORS.find((color) => color.name === name);
      this.type = type as FruitType;
    }
  }
}
