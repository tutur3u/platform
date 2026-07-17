import { describe, expect, it } from 'vitest';
import { getSquareLinkPresentation } from './square-link-presentation';

describe('getSquareLinkPresentation', () => {
  it('classifies a legacy fractional-price hold as ready to retry', () => {
    expect(
      getSquareLinkPresentation({
        lastError:
          'Square reported a non-whole USD price (8.1). Tuturuuu kept its value until an operator reviews the price.',
        status: 'error',
      })
    ).toEqual({ currency: 'USD', kind: 'price_retry', squarePrice: '8.1' });
  });

  it('does not hide an unrelated provider failure', () => {
    expect(
      getSquareLinkPresentation({
        lastError: 'Square request timed out.',
        status: 'error',
      })
    ).toEqual({ currency: null, kind: 'sync_error', squarePrice: null });
  });

  it('preserves the linked and review states reported by the API', () => {
    expect(
      getSquareLinkPresentation({ lastError: null, status: 'active' })
    ).toEqual({ currency: null, kind: 'linked', squarePrice: null });
    expect(
      getSquareLinkPresentation({ lastError: null, status: 'conflict' })
    ).toEqual({ currency: null, kind: 'conflict', squarePrice: null });
  });
});
