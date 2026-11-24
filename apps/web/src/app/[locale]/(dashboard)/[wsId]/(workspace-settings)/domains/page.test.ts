import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((target: { href: string; locale: string }) => {
    throw new Error(`redirect:${target.locale}:${target.href}`);
  })
);
vi.mock('@/i18n/routing', () => ({ redirect }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

import WorkspaceDomainsPage from './page';
import WorkspaceSSOPage from '../sso/page';

describe('retired SSO and Domains routes', () => {
  it('opens Settings -> Domains', async () => {
    await expect(
      WorkspaceDomainsPage({
        params: Promise.resolve({ locale: 'en', wsId: 'ws-1' }),
      })
    ).rejects.toThrow(
      'redirect:en:/ws-1?settingsDialog=open&settingsTab=workspace_domains'
    );
  });

  it('opens Settings -> Single sign-on', async () => {
    await expect(
      WorkspaceSSOPage({
        params: Promise.resolve({ locale: 'vi', wsId: 'ws-1' }),
      })
    ).rejects.toThrow(
      'redirect:vi:/ws-1?settingsDialog=open&settingsTab=workspace_sso'
    );
  });
});
