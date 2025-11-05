import { describe, expect, it } from 'vitest';

// Helper function to remove consecutive nulls from an array
// This is the same logic used in navigation.tsx
function removeConsecutiveNulls<T>(arr: (T | null)[]): (T | null)[] {
  const withoutConsecutive = arr.reduce<(T | null)[]>((acc, item, index) => {
    // Skip null if previous item was also null
    if (item === null && index > 0 && arr[index - 1] === null) {
      return acc;
    }
    acc.push(item);
    return acc;
  }, []);

  // Remove leading nulls
  while (withoutConsecutive.length > 0 && withoutConsecutive[0] === null) {
    withoutConsecutive.shift();
  }

  // Remove trailing nulls
  while (
    withoutConsecutive.length > 0 &&
    withoutConsecutive[withoutConsecutive.length - 1] === null
  ) {
    withoutConsecutive.pop();
  }

  return withoutConsecutive;
}

describe('removeConsecutiveNulls', () => {
  it('should remove consecutive nulls', () => {
    const input = ['a', null, null, 'b', null, 'c'];
    const expected = ['a', null, 'b', null, 'c'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle multiple consecutive nulls', () => {
    const input = ['a', null, null, null, 'b', null, null, 'c'];
    const expected = ['a', null, 'b', null, 'c'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should remove leading nulls', () => {
    const input = [null, null, 'a', 'b', null, 'c'];
    const expected = ['a', 'b', null, 'c'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should remove trailing nulls', () => {
    const input = ['a', null, 'b', 'c', null, null];
    const expected = ['a', null, 'b', 'c'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should remove both leading and trailing nulls', () => {
    const input = [null, 'a', null, 'b', null];
    const expected = ['a', null, 'b'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle array with only nulls', () => {
    const input = [null, null, null];
    const expected: (string | null)[] = [];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle array with no nulls', () => {
    const input = ['a', 'b', 'c'];
    const expected = ['a', 'b', 'c'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle empty array', () => {
    const input: (string | null)[] = [];
    const expected: (string | null)[] = [];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle array with single null', () => {
    const input = [null];
    const expected: (string | null)[] = [];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle array with single non-null item', () => {
    const input = ['a'];
    const expected = ['a'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should preserve single nulls between items', () => {
    const input = ['a', null, 'b', null, 'c', null, 'd'];
    const expected = ['a', null, 'b', null, 'c', null, 'd'];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should handle complex real-world navigation scenario', () => {
    // Simulates what might happen when some nav items are filtered out
    const input = [
      'dashboard',
      null, // separator
      'tasks', // shown
      null, // separator
      null, // item was filtered, leaving extra null
      'calendar', // shown
      null, // separator
      null, // item was filtered
      null, // item was filtered
      'settings',
      null, // trailing separator
      null, // trailing separator
    ];
    const expected = [
      'dashboard',
      null,
      'tasks',
      null,
      'calendar',
      null,
      'settings',
    ];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });

  it('should work with objects (navigation items)', () => {
    const item1 = { title: 'Item 1', href: '/1' };
    const item2 = { title: 'Item 2', href: '/2' };
    const item3 = { title: 'Item 3', href: '/3' };

    const input = [item1, null, null, item2, null, null, null, item3, null];
    const expected = [item1, null, item2, null, item3];
    expect(removeConsecutiveNulls(input)).toEqual(expected);
  });
});
