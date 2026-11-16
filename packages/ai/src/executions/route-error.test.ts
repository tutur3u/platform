import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const validateApiKeyHash = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'key', key_hash: 'fixture-hash', scopes: [] },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../api-key-hash', () => ({ validateApiKeyHash }));

import { createPOST } from './route';

describe('executions route errors', () => {
  it('returns a generic 500 without the server stack trace', async () => {
    const error = new Error('db exploded');
    error.stack =
      'Error: db exploded\n    at internal (/srv/app/secret.ts:1:1)';
    validateApiKeyHash.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const handler = createPOST({
      getLast30DaysStats: vi.fn(),
      getAllTimeStats: vi.fn(),
    });
    const response = await handler(
      new NextRequest('http://localhost/api/ai/executions', {
        method: 'POST',
        body: JSON.stringify({
          accessKey: { id: 'key', value: 'fixture' },
          configs: { wsId: 'workspace' },
        }),
      })
    );
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain('secret.ts');
    expect(body).not.toContain('db exploded');
    expect(JSON.parse(body)).toEqual({
      error: 'Could not complete the request. Please try again.',
      message: 'Could not complete the request. Please try again.',
    });
  });
});
