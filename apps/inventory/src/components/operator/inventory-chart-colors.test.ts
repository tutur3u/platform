import { describe, expect, it } from 'vitest';
import {
  INVENTORY_CHART_COLORS,
  INVENTORY_CHART_COMPARISON,
  INVENTORY_CHART_PRIMARY,
} from './inventory-chart-colors';

describe('Inventory chart colors', () => {
  it('uses complete theme colors without invalid nested hsl functions', () => {
    expect(INVENTORY_CHART_COLORS).toHaveLength(5);
    expect(INVENTORY_CHART_PRIMARY).toBe('var(--chart-1)');
    expect(INVENTORY_CHART_COMPARISON).toBe('var(--chart-3)');
    expect(
      INVENTORY_CHART_COLORS.every((color) => !color.includes('hsl('))
    ).toBe(true);
  });
});
