import { describe, expect, it } from 'vitest';
import { countLines, shouldVirtualizeSource } from './repository-source';

describe('repository source rendering thresholds', () => {
  it('keeps normal source files syntax highlighted', () => {
    expect(countLines('const answer = 42;\n')).toBe(2);
    expect(shouldVirtualizeSource('const answer = 42;\n')).toBe(false);
  });

  it('virtualizes generated files with many lines', () => {
    const generatedSource = Array.from(
      { length: 2_001 },
      (_, index) => `line ${index}`
    ).join('\n');

    expect(shouldVirtualizeSource(generatedSource)).toBe(true);
  });

  it('virtualizes source files with large byte payloads', () => {
    expect(shouldVirtualizeSource('a'.repeat(150_001))).toBe(true);
  });
});
