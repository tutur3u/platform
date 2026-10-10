import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import { RequestBodySchema } from './immediate-helpers';

describe('immediate notification request budget', () => {
  it('accepts automatic recovery and a single webhook batch', () => {
    expect(RequestBodySchema.safeParse({}).success).toBe(true);
    expect(RequestBodySchema.safeParse({ batch_id: 'batch' }).success).toBe(
      true
    );
  });

  it('accepts exactly 100 requested IDs and rejects 101', () => {
    expect(
      RequestBodySchema.safeParse({ batch_ids: Array(100).fill('batch') })
        .success
    ).toBe(true);
    expect(
      RequestBodySchema.safeParse({ batch_ids: Array(101).fill('batch') })
        .success
    ).toBe(false);
  });

  it('applies the existing single-ID length bound to every array ID', () => {
    expect(
      RequestBodySchema.safeParse({ batch_ids: ['x'.repeat(MAX_NAME_LENGTH)] })
        .success
    ).toBe(true);
    expect(
      RequestBodySchema.safeParse({
        batch_ids: ['x'.repeat(MAX_NAME_LENGTH + 1)],
      }).success
    ).toBe(false);
  });
});
