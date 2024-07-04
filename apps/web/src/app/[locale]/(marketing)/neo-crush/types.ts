export const width = 8;

export const FruitColors = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
] as const;
export type FruitColor = (typeof FruitColors)[number];

export const colorMap: Record<FruitColor, string> = {
  red: '#E63946', // A brighter shade of red for better visibility
  blue: '#457B9D', // A softer blue, easier on the eyes
  green: '#2A9D8F', // A more vibrant green
  yellow: '#FFD700', // A bright, golden yellow
  purple: '#9C89B8', // A softer, more inviting purple
  orange: '#F77F00', // A more vivid orange
};
