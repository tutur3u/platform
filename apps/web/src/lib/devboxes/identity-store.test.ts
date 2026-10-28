import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./store-utils', () => ({
  createPrivateDevboxClient: async () => ({ rpc }),
  DevboxStoreError: class extends Error {},
}));

import {
  IssueTokenSchema,
  issueDevboxAccessToken,
  resolveDevboxIdentity,
} from './identity-store';

beforeEach(() => vi.clearAllMocks());
it.each([
  {
    data: null,
    error: { message: 'column personal_pools_enabled does not exist' },
  },
  { data: { enabled: true }, error: null },
  { data: null, error: null },
])('missing schema or malformed identity data is disabled', async (result) => {
  rpc.mockResolvedValue(result);
  expect(await resolveDevboxIdentity({ userId: 'user' })).toBeNull();
});
it('a database read exception fails closed', async () => {
  rpc.mockRejectedValue(new Error('connection reset'));
  expect(
    await resolveDevboxIdentity({ token: `tdba_${'a'.repeat(64)}` })
  ).toBeNull();
});
it('issues 256-bit agent tokens and sends only SHA-256 to storage', async () => {
  rpc.mockResolvedValue({
    data: '11111111-1111-4111-8111-111111111111',
    error: null,
  });
  const input = IssueTokenSchema.parse({
    label: 'agent-a',
    scopes: ['devbox:run'],
  });
  expect(input.expiresInDays).toBe(7);
  const result = await issueDevboxAccessToken('bound-user', Date.now(), input);
  expect(result.token).toMatch(/^tdba_[a-f0-9]{64}$/);
  expect(rpc).toHaveBeenCalledWith(
    'issue_devbox_access_token',
    expect.objectContaining({
      p_user_id: 'bound-user',
      p_label: 'agent-a',
      p_hash: createHash('sha256').update(result.token).digest('hex'),
      p_prefix: result.token.slice(0, 13),
      p_scopes: ['devbox:run'],
    })
  );
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.token);
});
it.each([
  { scopes: ['devbox:serve'] },
  { scopes: ['devbox:maintenance'] },
  { scopes: ['fleet'] },
])('rejects scope $scopes', ({ scopes }) => {
  expect(IssueTokenSchema.safeParse({ label: 'agent-a', scopes }).success).toBe(
    false
  );
});
