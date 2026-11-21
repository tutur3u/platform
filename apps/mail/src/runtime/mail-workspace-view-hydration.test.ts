// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement as h, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { MailWorkspaceView } from './mail-workspace-view';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ usePathname: () => '/en/personal/inbox' }));
vi.mock('@tuturuuu/satellite/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@tuturuuu/satellite/user-nav-client', () => ({ default: () => null }));
vi.mock('./notification-popover', () => ({ default: () => null }));
vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/structure', () => ({
  Structure: ({ children }: { children?: ReactNode }) =>
    h('div', { 'data-slot': 'shell' }, children),
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/mail-client', () => ({
  MailAppClient: () => h('output', { 'data-client': 'managed' }),
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/connected-mail-client', () => ({
  ConnectedMailClient: () => h('output', { 'data-client': 'connected' }),
}));

const wsId = '00000000-0000-4000-8000-000000000001';
const workspace = {
  kind: 'workspace',
  actorId: '00000000-0000-4000-8000-000000000002',
  wsId,
  workspaceSlug: 'personal',
  profile: null,
  notificationWebAppUrl: 'https://tuturuuu.com',
  connectedByDefault: false,
  behavior: 'expanded',
  behaviorUpdatedAt: null,
  defaultCollapsed: false,
  sidebarExpandedWidth: '22rem',
  workspace: { id: wsId, personal: true, joined: true, tier: null },
} as unknown as Parameters<typeof MailWorkspaceView>[0]['workspace'];

const Adapter = withNuqsTestingAdapter({ searchParams: {}, hasMemory: true });
const view = () =>
  h(Adapter, null, h(MailWorkspaceView, { workspace, locale: 'en' }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('server-renders the shell with a loading list instead of a guessed mailbox state', () => {
  const html = renderToString(view());
  expect(html).toContain('data-slot="shell"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('data-slot="mail-skeleton-list"');
  expect(html).toContain('data-slot="mail-skeleton-reader"');
  expect(html).not.toContain('data-client');
});

it('hydrates the server markup without a mismatch, then mounts the real client', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const container = document.createElement('div');
  container.innerHTML = renderToString(view());
  document.body.append(container);
  expect(
    container.querySelector('[data-slot="mail-skeleton-list"]')
  ).not.toBeNull();
  await act(async () => {
    hydrateRoot(container, view());
  });
  expect(container.querySelector('[data-client="managed"]')).not.toBeNull();
  expect(
    container.querySelector('[data-slot="mail-skeleton-list"]')
  ).toBeNull();
  expect(errors).not.toHaveBeenCalled();
  container.remove();
});
