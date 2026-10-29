import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const urls: string[] = [];
  return { urls, actor: vi.fn(), profile: vi.fn(), workspace: vi.fn() };
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              ...(await mocks.actor()),
              id,
              email_confirmed_at: '2026-01-01',
              identities: [{ provider: 'email', identity_data: {} }],
            },
          },
          error: null,
        }),
      },
    },
  }),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.actor,
  getSatelliteCurrentUser: mocks.profile,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.workspace,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/custom/notification-popover-client', () => ({
  default: ({ webAppUrl }: { webAppUrl: string }) => {
    mocks.urls.push(webAppUrl);
    return createElement('a', { href: webAppUrl }, 'notifications');
  },
}));
vi.mock('@tuturuuu/satellite/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@tuturuuu/satellite/user-nav-client', () => ({ default: () => null }));
vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('../components/mail-actor-provider', () => ({
  MailActorProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/mail-workspace', () => ({
  MailWorkspace: () => null,
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/structure', () => ({
  Structure: ({
    children,
    actions,
  }: {
    children?: ReactNode;
    actions?: ReactNode;
  }) => createElement('div', null, actions, children),
}));

import { loadMailWorkspace } from './mail-workspace-model.server';
import { MailWorkspaceView } from './mail-workspace-view';
import { resolveNotificationWebAppUrl } from './notification-url.server';
import { withMailRequest } from './request-context';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.urls.length = 0;
  mocks.actor.mockResolvedValue({ id: 'actor', email: 'staff@tuturuuu.com' });
  mocks.profile.mockResolvedValue({ id: 'actor' });
  mocks.workspace.mockResolvedValue({
    id: 'tenant',
    personal: false,
    joined: true,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('server-resolved public notification configuration', () => {
  it('preserves the canonical production and development defaults', () => {
    vi.stubEnv('TTR_URL', '');
    vi.stubEnv('CENTRAL_PORT', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveNotificationWebAppUrl()).toBe('https://tuturuuu.com');
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveNotificationWebAppUrl()).toBe('http://localhost:7803');
  });
  for (const scenario of [
    {
      central: 'https://central.example.test',
      port: '8899',
      expected: 'https://central.example.test',
    },
    { central: '', port: '8899', expected: 'http://localhost:8899' },
  ])
    it(`serializes only the resolved URL and passes it through the actual view/popover for ${scenario.expected}`, async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('TTR_URL', scenario.central);
      vi.stubEnv('CENTRAL_PORT', scenario.port);
      vi.stubEnv('MAIL_PRIVATE_TEST_SENTINEL', 'not-public-value');
      const model = await withMailRequest(
        {
          request: new Request('https://mail.example.test/tenant/inbox'),
          responseHeaders: new Headers(),
          waitUntil: () => {},
        },
        () => loadMailWorkspace('tenant')
      );
      if (model.kind !== 'workspace')
        throw new Error('Expected authorized workspace');
      const serialized = JSON.stringify(model);
      expect(serialized).toContain(scenario.expected);
      expect(serialized).not.toContain('MAIL_PRIVATE_TEST_SENTINEL');
      expect(serialized).not.toContain('not-public-value');
      const transferred = JSON.parse(serialized);
      vi.stubEnv('TTR_URL', 'https://different-browser-value.example.test');
      vi.stubEnv('CENTRAL_PORT', '9977');
      const output = renderToString(
        createElement(MailWorkspaceView, {
          workspace: transferred,
          locale: 'en',
        })
      );
      expect(mocks.urls).toEqual([scenario.expected]);
      expect(output).toContain(scenario.expected);
      expect(output).not.toContain('different-browser-value');
      expect(output).not.toContain('9977');
    });
});
