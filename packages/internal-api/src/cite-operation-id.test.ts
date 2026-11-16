import { describe, expect, it } from 'vitest';
import { createCitationOperationId } from './cite-operation-id';

describe('citation operation identity', () => {
  it('encodes the server-checkable timestamp with UUIDv7 version and variant', () => {
    const now = 0x017f22e279b0;
    const id = createCitationOperationId({
      now: () => now,
      random: (bytes) => bytes.fill(255),
    });
    expect(id).toBe('017f22e2-79b0-7fff-bfff-ffffffffffff');
    expect(Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(now);
  });

  it.each([-1, Number.NaN, 1.5, 0x1000000000000])(
    'rejects invalid operation time %s',
    (now) => {
      expect(() => createCitationOperationId({ now: () => now })).toThrow(
        RangeError
      );
    }
  );

  it('accepts a replacement random buffer and rejects the wrong byte count', () => {
    expect(
      createCitationOperationId({
        now: () => 0,
        random: () => new Uint8Array(16).fill(255),
      })
    ).toBe('00000000-0000-7fff-bfff-ffffffffffff');
    expect(() =>
      createCitationOperationId({ random: () => new Uint8Array(15) })
    ).toThrow(RangeError);
  });
});
