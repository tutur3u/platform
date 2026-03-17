import { describe, expect, test } from 'vitest';

describe('temporary failing test', () => {
  test('this test intentionally fails', () => {
    expect(true).toBe(false);
  });

  test('another failing test', () => {
    expect(1 + 1).toBe(3);
  });
});
