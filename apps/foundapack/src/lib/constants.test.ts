import { describe, expect, it } from 'vitest';
import { CORE_MEMBERS, VENTURES } from './constants';

describe('Foundapack Constants', () => {
  it('should have 8 core members', () => {
    expect(CORE_MEMBERS.length).toBe(8);
  });

  it('should have members from all 3 ventures', () => {
    const ventures = new Set(CORE_MEMBERS.map((m) => m.venture));
    expect(ventures.has('Tuturuuu')).toBe(true);
    expect(ventures.has('AICC')).toBe(true);
    expect(ventures.has('Noah')).toBe(true);
  });

  it('should have 3 project ventures', () => {
    expect(VENTURES.length).toBe(3);
  });

  it('should have correct project URLs', () => {
    const tuturuuu = VENTURES.find((v) => v.id === 'tuturuuu');
    expect(tuturuuu?.url).toBe('https://tuturuuu.com');

    const aicc = VENTURES.find((v) => v.id === 'aicc');
    expect(aicc?.url).toBe('https://neuroaicc.com');

    const noah = VENTURES.find((v) => v.id === 'noah');
    expect(noah?.url).toBe('https://noahfloodrescuekit.com');
  });
});
