import { describe, expect, it, vi } from 'vitest';
import {
  createAuthRecoveryOverride,
  getAuthRecoverySnapshot,
  revokeAuthRecoveryOverride,
  sendAuthRecoveryEmail,
} from './auth-recovery';

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('auth recovery internal API helpers', () => {
  it('loads auth recovery snapshots with optional email diagnostics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        diagnostics: null,
        events: [],
        overrides: [],
      })
    );

    await getAuthRecoverySnapshot(
      { email: 'person@example.com' },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);

    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe(
      'https://web.test/api/v1/infrastructure/auth-recovery'
    );
    expect(parsedUrl.searchParams.get('email')).toBe('person@example.com');
    expect(init).toEqual(
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates, sends, and revokes auth recovery overrides through encoded routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        createJsonResponse({
          override: {
            id: 'override/1',
          },
        })
      )
    );

    await createAuthRecoveryOverride(
      {
        clearRelatedIpBlocks: true,
        email: 'person@example.com',
        reason: 'Manual review complete',
      },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await sendAuthRecoveryEmail(
      'override/1',
      { locale: 'en', next: '/en/personal' },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await revokeAuthRecoveryOverride(
      'override/1',
      { reason: 'No longer needed' },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.test/api/v1/infrastructure/auth-recovery',
      expect.objectContaining({
        body: JSON.stringify({
          clearRelatedIpBlocks: true,
          email: 'person@example.com',
          reason: 'Manual review complete',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://web.test/api/v1/infrastructure/auth-recovery/override%2F1/send-email',
      expect.objectContaining({
        body: JSON.stringify({ locale: 'en', next: '/en/personal' }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://web.test/api/v1/infrastructure/auth-recovery/override%2F1',
      expect.objectContaining({
        body: JSON.stringify({ reason: 'No longer needed' }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
  });
});
