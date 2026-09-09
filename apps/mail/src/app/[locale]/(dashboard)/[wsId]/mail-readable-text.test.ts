import { describe, expect, it } from 'vitest';
import { readableMailText } from './mail-readable-text';

describe('plain email spacing', () => {
  it('caps repeated blank lines while retaining paragraphs, line breaks and indentation', () => {
    expect(
      readableMailText('Hi,\r\n\r\n \r\n\r\nMessage\n\nRegards,\n  Sender')
    ).toBe('Hi,\n\nMessage\n\nRegards,\n  Sender');
  });
});
