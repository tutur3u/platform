import { describe, expect, it } from 'vitest';
import { formatMoneyLoverImportPreviewAmount } from './money-lover-import-dialog-utils';

describe('formatMoneyLoverImportPreviewAmount', () => {
  it('masks import preview amounts when finance numbers are hidden', () => {
    expect(formatMoneyLoverImportPreviewAmount(-125000, 'VND', true)).toBe(
      '•••••'
    );
  });

  it('formats import preview amounts when finance numbers are visible', () => {
    expect(formatMoneyLoverImportPreviewAmount(-125000, 'VND', false)).toMatch(
      /-125.000/
    );
  });
});
