import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/satellite/workspace-settings', () => ({
  createWorkspaceMembersNavLink: () => null,
}));

import { getNavigationLinks } from './navigation';

const feeLockHrefs = async (feeLockEnabled: boolean, canView: boolean) =>
  (
    await getNavigationLinks({
      feeLockEnabled,
      permissions: {
        withoutPermission: (p: string) => p === 'view_invoices' && !canView,
      } as never,
      personalOrWsId: 'ws-fixture',
    })
  )
    .map((link) => link?.href)
    .filter((href) => href?.endsWith('/fee-lock'));

describe('finance navigation fee-lock item', () => {
  it('appears only with ENABLE_FEE_LOCK on and view_invoices held', async () => {
    expect(await feeLockHrefs(false, true)).toEqual([]);
    expect(await feeLockHrefs(true, false)).toEqual([]);
    expect(await feeLockHrefs(true, true)).toEqual([
      '/ws-fixture/invoices/fee-lock',
    ]);
  });
});
