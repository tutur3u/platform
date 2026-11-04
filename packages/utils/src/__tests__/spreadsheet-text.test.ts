import { describe, expect, it } from 'vitest';
import { sanitizeSpreadsheetText } from '../spreadsheet-text';

describe('sanitizeSpreadsheetText', () => {
  it.each([
    ['=HYPERLINK("https://example.test","x")'],
    ['+1+1'],
    ['-2+3'],
    ['@SUM(A1:A2)'],
    ['\t=1+1'],
    ['\r=1+1'],
    ['＝1+1'],
    ['＋1'],
    ['－1'],
    ['＠x'],
  ])('prefixes an apostrophe to %j', (value) => {
    expect(sanitizeSpreadsheetText(value)).toBe(`'${value}`);
  });

  it.each([
    ['Nguyễn Văn A'],
    ['Lớp A: 800.000đ/8 buổi'],
    ['a=b'],
    [' =1'],
    [''],
  ])('keeps safe text %j unchanged', (value) => {
    expect(sanitizeSpreadsheetText(value)).toBe(value);
  });

  it('handles numbers, null and undefined as text', () => {
    expect(sanitizeSpreadsheetText(-5)).toBe("'-5");
    expect(sanitizeSpreadsheetText(12)).toBe('12');
    expect(sanitizeSpreadsheetText(null)).toBe('');
    expect(sanitizeSpreadsheetText(undefined)).toBe('');
  });

  it('drops XML-invalid controls, then guards what they hid', () => {
    expect(sanitizeSpreadsheetText('\u0000=1+1')).toBe("'=1+1");
    expect(sanitizeSpreadsheetText('a\u0007b\nc')).toBe('ab\nc');
  });
});
