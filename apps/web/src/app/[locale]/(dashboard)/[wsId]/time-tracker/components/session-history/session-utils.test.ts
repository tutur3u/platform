import { describe, expect, it } from 'vitest';
import type { StackedSession } from './session-types';
import { sortSessionGroups } from './session-utils';

describe('sortSessionGroups', () => {
  const mockSessions: StackedSession[] = [];

  it('sorts valid dates in descending order (newest first)', () => {
    const entries: [string, StackedSession[]][] = [
      ['Monday, January 1, 2024', mockSessions],
      ['Wednesday, January 3, 2024', mockSessions],
      ['Tuesday, January 2, 2024', mockSessions],
    ];

    const sorted = sortSessionGroups(entries);

    expect(sorted[0]![0]).toBe('Wednesday, January 3, 2024');
    expect(sorted[1]![0]).toBe('Tuesday, January 2, 2024');
    expect(sorted[2]![0]).toBe('Monday, January 1, 2024');
  });

  it('sorts date keys before non-date keys', () => {
    const entries: [string, StackedSession[]][] = [
      ['Invalid Date', mockSessions],
      ['Monday, January 1, 2024', mockSessions],
      ['Another Invalid Date', mockSessions],
    ];

    const sorted = sortSessionGroups(entries);

    expect(sorted[0]![0]).toBe('Monday, January 1, 2024');
    // The rest should be sorted alphabetically
    expect(sorted[1]![0]).toBe('Another Invalid Date');
    expect(sorted[2]![0]).toBe('Invalid Date');
  });

  it('sorts non-date keys alphabetically', () => {
    const entries: [string, StackedSession[]][] = [
      ['Z', mockSessions],
      ['A', mockSessions],
      ['M', mockSessions],
    ];

    const sorted = sortSessionGroups(entries);

    expect(sorted[0]![0]).toBe('A');
    expect(sorted[1]![0]).toBe('M');
    expect(sorted[2]![0]).toBe('Z');
  });

  it('handles empty entries', () => {
    const entries: [string, StackedSession[]][] = [];
    const sorted = sortSessionGroups(entries);
    expect(sorted).toEqual([]);
  });

  it('is deterministic for identical dates', () => {
    const entries: [string, StackedSession[]][] = [
      ['Monday, January 1, 2024', mockSessions],
      ['Monday, January 1, 2024', mockSessions],
    ];

    const sorted = sortSessionGroups(entries);
    expect(sorted.length).toBe(2);
    expect(sorted[0]![0]).toBe('Monday, January 1, 2024');
    expect(sorted[1]![0]).toBe('Monday, January 1, 2024');
  });
});
