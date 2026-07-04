import { describe, expect, it } from 'vitest';
import { getMemoryTone } from './observability-resource-clusters.utils';

const mib = 1024 * 1024;

describe('getMemoryTone', () => {
  it('matches infrastructure resource memory tiers', () => {
    expect(getMemoryTone(199 * mib)).toBe('green');
    expect(getMemoryTone(200 * mib)).toBe('amber');
    expect(getMemoryTone(500 * mib)).toBe('amber');
    expect(getMemoryTone(501 * mib)).toBe('orange');
    expect(getMemoryTone(1024 * mib)).toBe('orange');
    expect(getMemoryTone(1025 * mib)).toBe('red');
  });
});
