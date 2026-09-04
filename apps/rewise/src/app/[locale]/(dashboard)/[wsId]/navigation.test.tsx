import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

vi.mock('@tuturuuu/satellite/workspace-settings', () => ({
  createWorkspaceMembersNavLink: () => null,
}));

import { getNavigationLinks } from './navigation';

describe('Rewise navigation', () => {
  it('keeps operational routes workspace-scoped and hides unfinished tools', async () => {
    const links = (await getNavigationLinks({ personalOrWsId: 'personal' }))
      .filter(Boolean)
      .map((link) => link!);

    expect(links.map((link) => link.href)).toEqual([
      '/personal/new',
      '/personal/tools',
    ]);
    expect(links.some((link) => link.href?.includes('imagine'))).toBe(false);
  });
});
