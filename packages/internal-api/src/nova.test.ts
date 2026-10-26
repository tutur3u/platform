import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchNovaSubmissionUsers, verifyNovaChallengePassword } from './nova';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createJsonResponse(payload: unknown) {
  return {
    headers: new Headers(),
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('Nova internal API helpers', () => {
  it('keeps the browser password request on the Nova origin and preserves reset status', async () => {
    vi.stubGlobal('window', {});
    const response = new Response(
      JSON.stringify({ code: 'PASSWORD_RESET_REQUIRED' }),
      { status: 409 }
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = await verifyNovaChallengePassword(
      { challengeId: 'challenge', password: 'fixture' },
      { fetch: fetchMock }
    );
    expect(result).toBe(response);
    expect(result.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/challenges/verify-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ challengeId: 'challenge', password: 'fixture' }),
      })
    );
  });
  it('calls the bounded submission-user search with isolated query inputs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        selected: null,
      })
    );

    await searchNovaSubmissionUsers(
      { q: 'learner@example.test', selectedUserId: 'selected-user' },
      {
        baseUrl: 'https://nova.example.test',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://nova.example.test/api/v1/nova/challenge-management/users/search?q=learner%40example.test&selectedUserId=selected-user',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });
});
