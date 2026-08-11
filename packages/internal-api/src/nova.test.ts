import { describe, expect, it, vi } from 'vitest';
import { searchNovaSubmissionUsers } from './nova';

function createJsonResponse(payload: unknown) {
  return {
    headers: new Headers(),
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('Nova internal API helpers', () => {
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
