import { describe, expect, it } from 'vitest';
import { JsonPayloadSchema } from './json-payload-schema';

describe('JsonPayloadSchema', () => {
  it('accepts nested JSON payloads', () => {
    expect(
      JsonPayloadSchema.safeParse({
        items: ['a', 1, true, null, { nested: ['b'] }],
      }).success
    ).toBe(true);
  });

  it('rejects JavaScript-only values', () => {
    expect(JsonPayloadSchema.safeParse({ value: undefined }).success).toBe(
      false
    );
    expect(
      JsonPayloadSchema.safeParse({ value: Number.POSITIVE_INFINITY }).success
    ).toBe(false);
    expect(JsonPayloadSchema.safeParse(new Date()).success).toBe(false);
  });
});
