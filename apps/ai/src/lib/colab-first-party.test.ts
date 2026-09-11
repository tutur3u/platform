import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const user = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ auth: { admin: { getUserById: user } } }),
}));

import { authenticateColabGrant } from './colab-first-party';

const body = '{"prompt":"approved"}';
const digest = createHash('sha256').update(body).digest('hex');
const sponsor = {
  workshopId: '07a13d30-0599-4572-8d1d-159860105e10',
  hostId: 'host',
};
const request = () =>
  new Request('https://ai.tuturuuu.com/v1/colab/responses', {
    headers: { 'x-colab-grant': 'a'.repeat(64) },
  });
beforeEach(() => {
  user.mockResolvedValue({
    data: {
      user: {
        id: 'host',
        email: 'host@tuturuuu.com',
        email_confirmed_at: '2026-01-01',
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ approved: true, digest }))
  );
});
afterEach(() => vi.unstubAllGlobals());
it('pins canonical Colab and charges root under the verified host without an API key', async () => {
  expect(await authenticateColabGrant(request(), body, sponsor)).toEqual({
    kind: 'first-party',
    appId: 'colab',
    actorId: 'host',
    workspaceId: '00000000-0000-0000-0000-000000000000',
  });
  expect(fetch).toHaveBeenCalledWith(
    'https://colab.tuturuuu.com/api/sponsorship/verify',
    expect.objectContaining({
      redirect: 'error',
      cache: 'no-store',
      body: JSON.stringify({
        token: 'a'.repeat(64),
        digest,
        roomId: sponsor.workshopId,
      }),
    })
  );
});
it.each([403, 404, 503])(
  'rejects unapproved or unavailable room evidence (%s)',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status }))
    );
    await expect(
      authenticateColabGrant(request(), body, sponsor)
    ).rejects.toThrow();
  }
);
it('rejects body substitution', async () => {
  await expect(
    authenticateColabGrant(request(), 'changed', sponsor)
  ).rejects.toThrow();
});
it.each(['host@example.com', 'host@tuturuuu.com.attacker.test'])(
  'rejects ineligible hosts %s',
  async (email) => {
    user.mockResolvedValue({
      data: { user: { id: 'host', email, email_confirmed_at: '2026-01-01' } },
    });
    await expect(
      authenticateColabGrant(request(), body, sponsor)
    ).rejects.toThrow();
  }
);
it('rejects missing capability before any outbound request', async () => {
  await expect(
    authenticateColabGrant(
      new Request('https://ai.tuturuuu.com'),
      body,
      sponsor
    )
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
