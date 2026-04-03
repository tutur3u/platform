// types.ts
export const BOARD_SIZE = 8;
export const DEFAULT_TURNS = 20;
export const PTS_PER_FRUIT = 10;
const NULL_COLOR = 'var(--foreground)';

const FRUIT_COLOR_NAMES = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'pink',
  'orange',
  'null',
] as const;

const FRUIT_COLOR_CODES = {
  red: '#E63946',
  blue: '#457B9D',
  green: '#2A9D8F',
  yellow: '#FFD700',
  purple: '#9C89B8',
  pink: '#F4A261',
  orange: '#F77F00',
  null: NULL_COLOR,
} as const;

export type AssetType = 'library' | 'normal';

const ASSET_TYPE = 'library';

const ASSET_DIR =
  ASSET_TYPE === 'library' ? '/neo-crush/library2' : '/neo-crush';

const FRUIT_COLOR_SOURCES = {
  red: `${ASSET_DIR}/red.png` as const,
  blue: `${ASSET_DIR}/blue.png` as const,
  green: `${ASSET_DIR}/green.png` as const,
  yellow: `${ASSET_DIR}/yellow.png` as const,
  purple: `${ASSET_DIR}/purple.png` as const,
  pink: `${ASSET_DIR}/pink.png` as const,
  orange: `${ASSET_DIR}/orange.png` as const,
  null: undefined,
} as const;

const FRUIT_TYPES = [
  'normal',
  'vertical',
  'horizontal',
  'plus',
  'explosive',
  'big-explosive',
  'rainbow',
] as const;

export type FruitColorName = (typeof FRUIT_COLOR_NAMES)[number];
export type FruitColorCode = (typeof FRUIT_COLOR_CODES)[FruitColorName];
export type FruitColorSrc = (typeof FRUIT_COLOR_SOURCES)[FruitColorName];
export type FruitType = (typeof FRUIT_TYPES)[number];

export const getColorCode = (color: FruitColorName) => FRUIT_COLOR_CODES[color];
export const getColorSrc = (color: FruitColorName) =>
  FRUIT_COLOR_SOURCES[color];

export const getRandomFruitColor = () =>
  FRUIT_COLOR_NAMES[Math.floor(Math.random() * FRUIT_COLOR_NAMES.length)];

export class Fruit {
  color: FruitColorName;
  type: FruitType;

  constructor(color?: FruitColorName, type?: FruitType) {
    const colorIndex = color
      ? FRUIT_COLOR_NAMES.indexOf(color)
      : Math.floor(Math.random() * (FRUIT_COLOR_NAMES.length - 1));

    this.color =
      type === 'rainbow' ? 'null' : (FRUIT_COLOR_NAMES[colorIndex] ?? 'null');
    this.type = type ?? 'normal';
  }
}

export type Fruits = (Fruit | undefined)[];
