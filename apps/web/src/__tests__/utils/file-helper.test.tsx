import { describe, expect, it } from 'vitest';
import { formatBytes } from '@/utils/file-helper';

describe('formatBytes', () => {
  it('should format bytes to KB with 3 decimals when bytes is less than 1024', () => {
    const bytes = 1023;
    const formattedBytes = formatBytes(bytes, 3);
    expect(formattedBytes).toBe('0.999 KB');
  });

  it('should format bytes to KB with 2 decimals when bytes is less than 1024', () => {
    const bytes = 1023;
    const formattedBytes = formatBytes(bytes, 2);
    expect(formattedBytes).toBe('1 KB');
  });

  it('should format bytes to KB with 0 decimals when bytes is less than 1024 and decimals is 0', () => {
    const bytes = 1023;
    const formattedBytes = formatBytes(bytes, 0);
    expect(formattedBytes).toBe('1 KB');
  });

  it('should format bytes to MB with 2 decimals when bytes is greater than or equal to 1024', () => {
    const bytes = 1024;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('1 KB');
  });

  it('should handle negative bytes', () => {
    const bytes = -1024;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('0 Bytes');
  });

  it('should handle very large numbers (TB and beyond)', () => {
    const bytes = 1024 * 1024 * 1024 * 1024; // 1 TB
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('1 TB');

    const bytes2 = 1024 * 1024 * 1024 * 1024 * 1024; // 1 PB
    const formattedBytes2 = formatBytes(bytes2);
    expect(formattedBytes2).toBe('1 PB');
  });

  it('should handle fractional parts of bytes', () => {
    const bytes = 512.5;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('0.5 KB');
  });

  it('should handle fractional parts of mega bytes', () => {
    const bytes = 1024 * 1024 + 512.5;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('1 MB');
  });

  it('should handle zero bytes', () => {
    const bytes = 0;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('0 Bytes');
  });

  it('should handle negative zero bytes', () => {
    const bytes = -0;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('0 Bytes');
  });

  it('should handle very small fractional bytes', () => {
    const bytes = 0.001;
    const formattedBytes = formatBytes(bytes);
    expect(formattedBytes).toBe('0 Bytes');
  });
});
