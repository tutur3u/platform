import { describe, expect, it } from 'vitest';
import { sanitizeLogError, sanitizeLogValue } from './log-sanitizer';

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

  it('formats errors as name and message without the stack', () => {
    const error = new TypeError('bad\ninput');
    expect(sanitizeLogValue(error)).toBe('TypeError: badinput');
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

describe('sanitizeLogError', () => {
  it('logs only the name, code and single-line message', () => {
    const error = Object.assign(new Error('row\r\n[Fake] forged'), {
      code: 'P0001',
      details: 'internal detail',
    });
    const logged = sanitizeLogError(error);
    expect(logged).toBe('Error [P0001]: row[Fake] forged');
    expect(logged).not.toContain('internal detail');
    expect(logged).not.toContain('at ');
  });

  it('handles plain provider error objects without logging other fields', () => {
    const logged = sanitizeLogError({
      code: '23505',
      details: 'Key (email)=(someone@example.com) already exists.',
      hint: null,
      message: 'duplicate key value violates unique constraint',
    });
    expect(logged).toBe(
      'Error [23505]: duplicate key value violates unique constraint'
    );
  });

  it('falls back to the value formatter for non-error values', () => {
    expect(sanitizeLogError('plain\nstring')).toBe('plainstring');
    expect(sanitizeLogError(undefined)).toBe('undefined');
  });

  it('bounds the message length', () => {
    expect(sanitizeLogError(new Error('x'.repeat(1000)), 20)).toBe(
      `Error: ${'x'.repeat(13)}...[truncated]`
    );
  });
});
