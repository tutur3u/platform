import {
  getAiStudioRequestId,
  getIdempotencyKey,
} from '@tuturuuu/ai/studio/request';
import { describe, expect, it } from 'vitest';

describe('AI Studio request metadata', () => {
  it('preserves bounded request and idempotency identifiers', () => {
    const request = new Request('https://ai.tuturuuu.com/v1/responses', {
      headers: {
        'idempotency-key': 'retry-safe-request',
        'x-request-id': 'client-request-id',
      },
    });

    expect(getAiStudioRequestId(request)).toBe('client-request-id');
    expect(getIdempotencyKey(request)).toBe('retry-safe-request');
  });

  it('generates a request identifier when the client omits one', () => {
    const request = new Request('https://ai.tuturuuu.com/v1/models');
    expect(getAiStudioRequestId(request)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
