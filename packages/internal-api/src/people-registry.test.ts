import { describe, expect, it, vi } from 'vitest';
import {
  getPeopleRegistryControl,
  listPeople,
  updatePerson,
} from './people-registry';

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

const wsId = '4f1f8c6e-4a39-4a8e-9a3f-0f4e0a1d2c3b';

describe('people registry client', () => {
  it('requests the workspace route without caching or redirects', async () => {
    const fetch = fetchReturning(200, {
      isOwner: true,
      captureEnabled: false,
      personalSessionsEnabled: false,
      stopped: false,
      generation: 1,
    });
    const result = await getPeopleRegistryControl(wsId, {
      baseUrl: 'https://tuturuuu.com',
      fetch,
    });
    expect(result).toMatchObject({ ok: true, data: { isOwner: true } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(
      `https://tuturuuu.com/api/v1/workspaces/${wsId}/people-registry`
    );
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });

  it('returns a revision conflict as data instead of throwing', async () => {
    const fetch = fetchReturning(409, {
      reason: 'revision_conflict',
      version: 4,
    });
    const result = await updatePerson(
      wsId,
      'p',
      { baseVersion: 3, label: 'x' },
      { baseUrl: 'https://tuturuuu.com', fetch }
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'revision_conflict',
      data: { reason: 'revision_conflict', version: 4 },
    });
  });

  it('rejects a malformed listing', async () => {
    const fetch = fetchReturning(200, { persons: [{ id: 'nope' }] });
    await expect(
      listPeople(wsId, {}, { baseUrl: 'https://tuturuuu.com', fetch })
    ).rejects.toThrow();
  });
});
