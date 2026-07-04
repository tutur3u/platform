import { describe, expect, it, vi } from 'vitest';
import {
  approveRateLimitAppeal,
  listRateLimitAppeals,
  rejectRateLimitAppeal,
  submitRateLimitAppeal,
} from './rate-limit-appeals';

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('rate-limit appeal internal API helpers', () => {
  it('submits an appeal through the public API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        appeal: { id: 'appeal-1' },
        coalesced: false,
        temporaryReliefExpiresAt: '2026-06-27T01:00:00.000Z',
      })
    );

    await submitRateLimitAppeal(
      {
        diagnostics: {
          request: { requestPath: '/api/v1/workspaces/ws/users/groups' },
        },
        message: 'Legitimate classroom traffic',
        turnstileToken: 'captcha-token',
      },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.test/api/v1/rate-limit-appeals',
      expect.objectContaining({
        body: JSON.stringify({
          diagnostics: {
            request: { requestPath: '/api/v1/workspaces/ws/users/groups' },
          },
          message: 'Legitimate classroom traffic',
          turnstileToken: 'captcha-token',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('lists appeals through the infrastructure API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        appeals: [],
        summary: { approved: 0, closed: 0, pending: 0, rejected: 0, total: 0 },
      })
    );

    await listRateLimitAppeals(
      { limit: 50, q: '203.0.113', status: 'pending' },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);

    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe(
      'https://web.test/api/v1/infrastructure/rate-limit-appeals'
    );
    expect(parsedUrl.searchParams.get('limit')).toBe('50');
    expect(parsedUrl.searchParams.get('q')).toBe('203.0.113');
    expect(parsedUrl.searchParams.get('status')).toBe('pending');
    expect(init).toEqual(expect.objectContaining({ cache: 'no-store' }));
  });

  it('approves and rejects appeals through the item action API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          appeal: { id: 'appeal-1' },
          rule: null,
          unblocked: true,
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          appeal: { id: 'appeal-2' },
          rule: null,
          unblocked: false,
        })
      );

    await approveRateLimitAppeal(
      'appeal-1',
      {
        expiresInDays: 30,
        reviewNote: 'Confirmed legitimate usage',
        trustMultiplier: 3,
        workspaceId: '42529372-c669-4833-bb32-2cab1f4ffd83',
      },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    await rejectRateLimitAppeal(
      'appeal-2',
      { reviewNote: 'Still abusive' },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.test/api/v1/infrastructure/rate-limit-appeals/appeal-1',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'approve',
          expiresInDays: 30,
          reviewNote: 'Confirmed legitimate usage',
          trustMultiplier: 3,
          workspaceId: '42529372-c669-4833-bb32-2cab1f4ffd83',
        }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://web.test/api/v1/infrastructure/rate-limit-appeals/appeal-2',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'reject',
          reviewNote: 'Still abusive',
        }),
        method: 'PATCH',
      })
    );
  });
});
