import { expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc }) }),
}));

import { identityRpc } from './identity-store';

it.each([
  ['22023', 422, 'DEVBOX_LIMIT_EXCEEDS_GRANT'],
  ['42501', 403, 'DEVBOX_GRANT_REFUSED'],
  ['XX000', 503, undefined],
])('masks database code %s', async (code, status, typed) => {
  rpc.mockResolvedValue({
    data: null,
    error: { code, message: 'private secret database detail' },
  });
  await expect(identityRpc('test', {})).rejects.toMatchObject({
    status,
    code: typed,
  });
  await expect(identityRpc('test', {})).rejects.not.toThrow('private secret');
});
