import { describe, expect, it } from 'vitest';
import { sanitizeLogValue } from './log-sanitizer';

describe('sanitizeLogValue', () => {
  it('keeps ordinary values unchanged', () => {
    expect(sanitizeLogValue('ws-123')).toBe('ws-123');
    expect(sanitizeLogValue('Lịch học CS1')).toBe('Lịch học CS1');
    expect(sanitizeLogValue(42)).toBe('42');
    expect(sanitizeLogValue(null)).toBe('null');
    expect(sanitizeLogValue(undefined)).toBe('undefined');
  });

  it('removes line breaks so a value cannot start a new log line', () => {
    const value = 'ws-1\r\n[Fake] forged entry\u2028next\u2029end\nlast';
    const sanitized = sanitizeLogValue(value);
    expect(sanitized).not.toMatch(/[\r\n\u2028\u2029]/);
    expect(sanitized).toBe('ws-1[Fake] forged entrynextendlast');
  });

  it('removes terminal control and bidi override characters', () => {
    const sanitized = sanitizeLogValue('a\u001b[31mred\u0000\u007f\u202ex\tb');
    expect(sanitized).toBe('a[31mredxb');
  });

  it('serializes objects as single-line JSON', () => {
    expect(sanitizeLogValue({ title: 'line\nbreak', id: 1 })).toBe(
      '{"title":"line\\nbreak","id":1}'
    );
  });

  it('formats errors with their stack on one line', () => {
    const error = new Error('bad\ninput');
    const sanitized = sanitizeLogValue(error);
    expect(sanitized.startsWith('Error: bad | input')).toBe(true);
    expect(sanitized).not.toMatch(/[\r\n]/);
  });

  it('falls back when a value cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(sanitizeLogValue(circular)).toBe('[object Object]');
  });

  it('bounds the logged length', () => {
    const sanitized = sanitizeLogValue('x'.repeat(50), 10);
    expect(sanitized).toBe(`${'x'.repeat(10)}...[truncated]`);
  });
});
