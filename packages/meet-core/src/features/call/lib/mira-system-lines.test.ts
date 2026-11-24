import { expect, it } from 'vitest';
import { miraLineKey } from './mira-system-lines';

const line = (id: string, revision?: number) => ({
  id,
  notice: { kind: 'mira.on' as const, revision },
});

it('keys a line by its acceptance revision only when that is an integer above 0', () => {
  expect(miraLineKey(line('a', 3))).toBe('mira.on:3');
  expect(miraLineKey(line('b', 3))).toBe('mira.on:3');
  for (const revision of [undefined, 0, -1, 1.5, Number.NaN])
    expect(miraLineKey(line('c', revision))).toBe('id:c');
});
