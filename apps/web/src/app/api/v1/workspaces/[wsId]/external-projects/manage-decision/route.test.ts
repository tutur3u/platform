import { afterEach, describe, expect, it, vi } from 'vitest';

const decide = vi.hoisted(() => vi.fn());
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/external-projects/manage-decision', () => ({
  requireWorkspaceExternalProjectManageDecision: decide,
}));

import { GET } from './route';

function request() {
  return GET(new Request('https://example.test/manage-decision'), {
    params: Promise.resolve({ wsId: 'fixture-workspace' }),
  });
}

afterEach(() => {
  vi.useRealTimers();
  decide.mockReset();
});

describe('external project manage decision', () => {
  it('denies a downgraded grant and retains a private cache policy', async () => {
    decide.mockResolvedValueOnce({
      ok: true,
      decision: {
        decision: 'allow',
        actorId: 'fixture-actor',
        workspaceId: 'fixture-workspace',
        scopes: ['external-projects:manage'],
      },
    });
    expect(await (await request()).json()).toMatchObject({ decision: 'allow' });
    decide.mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const denied = await request();
    expect(denied.status).toBe(403);
    expect(denied.headers.get('cache-control')).toBe('private, no-store');
  });

  it('fails closed when the live grant does not arrive', async () => {
    vi.useFakeTimers();
    decide.mockReturnValueOnce(new Promise(() => {}));
    const pending = request();
    await vi.advanceTimersByTimeAsync(4000);
    expect((await pending).status).toBe(503);
  });
});
