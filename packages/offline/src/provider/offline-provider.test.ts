import { describe, expect, it } from 'vitest';
import { isMountedDocument } from './offline-provider';

const scope = (value: unknown) =>
  ({ __tuturuuuAppBase: value }) as unknown as typeof globalThis;

describe('isMountedDocument', () => {
  it.each([
    ['/tasks', true],
    [() => '/finance', true],
    ['', false],
    ['/', false],
    [() => '', false],
    [undefined, false],
    [42, false],
  ])('base %s mounted=%s', (value, mounted) => {
    expect(isMountedDocument(scope(value))).toBe(mounted);
  });
});
