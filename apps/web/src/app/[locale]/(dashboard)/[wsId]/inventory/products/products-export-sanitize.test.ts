import { describe, expect, it } from 'vitest';

import {
  neutralizeSpreadsheetFormula,
  neutralizeSpreadsheetFormulaCells,
} from './products-export-sanitize';

describe('neutralizeSpreadsheetFormula', () => {
  it.each([
    ['=HYPERLINK("https://example.test")'],
    ['+SUM(1,1)'],
    ['-2+3'],
    ['@IMPORTXML("https://example.test")'],
    ['\t=cmd'],
    ['\r=cmd'],
    ['\n=cmd'],
    ['  =cmd'],
  ])('prefixes risky spreadsheet cell value %j', (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
  });

  it.each([
    'Product name',
    'SKU-123',
    '  plain text',
    '',
    '0',
  ])('preserves safe spreadsheet cell value %j', (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(value);
  });
});

describe('neutralizeSpreadsheetFormulaCells', () => {
  it('neutralizes each exported string cell while preserving headers', () => {
    expect(
      neutralizeSpreadsheetFormulaCells({
        Category: '=FORMULA()',
        Name: 'Normal product',
        Stock: 'Warehouse: +SUM(1,1)',
      })
    ).toEqual({
      Category: "'=FORMULA()",
      Name: 'Normal product',
      Stock: 'Warehouse: +SUM(1,1)',
    });
  });
});
