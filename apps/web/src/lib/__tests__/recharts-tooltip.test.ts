import { describe, expect, it } from 'vitest';
import type { RechartsTooltipFormatter } from '../recharts-tooltip';
import {
  formatTooltipValue,
  getTooltipDisplayValue,
  getTooltipName,
  getTooltipNumber,
} from '../recharts-tooltip';

describe('recharts-tooltip', () => {
  it('extracts numeric values from supported recharts tooltip payloads', () => {
    expect(getTooltipNumber(42)).toBe(42);
    expect(getTooltipNumber('12.5')).toBe(12.5);
    expect(getTooltipNumber(['pending', '7.25'])).toBe(7.25);
  });

  it('keeps non-numeric tooltip payloads displayable', () => {
    expect(getTooltipNumber(['queued', 'pending'])).toBeNull();
    expect(getTooltipDisplayValue(['queued', 'pending'])).toBe(
      'queued, pending'
    );
    expect(getTooltipName(5)).toBe('5');
  });

  it('formats tooltip callbacks against the current recharts formatter type', () => {
    const formatter: RechartsTooltipFormatter = (value, name) => [
      formatTooltipValue(
        value,
        (numericValue) => numericValue.toFixed(2),
        (displayValue) => `state:${displayValue}`
      ),
      getTooltipName(name),
    ];

    expect(formatter('12.5', 'Cost', {} as never, 0, [])).toEqual([
      '12.50',
      'Cost',
    ]);
    expect(
      formatter(['queued', 'pending'], 'Status', {} as never, 0, [])
    ).toEqual(['state:queued, pending', 'Status']);
  });
});
