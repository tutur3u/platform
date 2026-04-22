import { describe, expect, it } from 'vitest';
import { normalizeSepayPayload } from './schemas';

describe('normalizeSepayPayload', () => {
  it('accepts explicit SePay datetime formats and normalizes them to ISO', () => {
    const parsed = normalizeSepayPayload({
      amount: '125000.50',
      created_at: '2026-04-22 10:15:30',
      direction: 'income',
      id: 'evt_123',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.transactionDate).toBe(
      '2026-04-22T03:15:30.000Z'
    );
  });

  it('rejects decimal amounts beyond the safe integer boundary', () => {
    const parsed = normalizeSepayPayload({
      amount: '9007199254740992.25',
      created_at: '2026-04-22T10:15:30Z',
      direction: 'income',
      id: 'evt_123',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects decimal amounts that cross the safe integer boundary with a fraction', () => {
    const parsed = normalizeSepayPayload({
      amount: '9007199254740991.01',
      created_at: '2026-04-22T10:15:30Z',
      direction: 'income',
      id: 'evt_123',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects negative amounts instead of normalizing them to positive', () => {
    const parsed = normalizeSepayPayload({
      amount: '-500',
      created_at: '2026-04-22T10:15:30Z',
      direction: 'income',
      id: 'evt_123',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects ambiguous non-ISO date strings', () => {
    const parsed = normalizeSepayPayload({
      amount: '125000',
      created_at: '04/22/2026 10:15:30',
      direction: 'income',
      id: 'evt_123',
    });

    expect(parsed.success).toBe(false);
  });
});
