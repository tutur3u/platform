// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement as h, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailWorkspaceView } from './mail-workspace-view';
import { useMeetMailWorkspaceScope } from '../app/[locale]/(dashboard)/[wsId]/meet-mail-workspace-scope';
import { useMailActor } from '../components/mail-actor-provider';

const observed = vi.hoisted(() => ({
  structure: vi.fn(),
  realtime: vi.fn(),
  identity: vi.fn(() => {
    throw new Error('Unexpected identity lookup');
  }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ usePathname: () => '/en/personal/inbox' }));
vi.mock('@tuturuuu/satellite/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@tuturuuu/satellite/user-nav-client', () => ({ default: () => null }));
vi.mock('./notification-popover', () => ({ default: () => null }));
vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: ({
    wsId,
    children,
  }: {
    wsId: string;
    children?: ReactNode;
  }) => {
    observed.realtime(wsId);
    return children;
  },
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: observed.identity,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: observed.identity,
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/structure', () => ({
  Structure: (props: {
    children?: ReactNode;
    wsId: string;
    personalOrWsId: string;
    links: { href: string }[];
  }) => {
    observed.structure(props);
    return h('div', null, props.children);
  },
}));
// Keep the real native view, MailWorkspace, source/actor providers and UUID adapter.
vi.mock('../app/[locale]/(dashboard)/[wsId]/connected-mail-client', () => ({
  ConnectedMailClient: ({ workspaceId }: { workspaceId: string }) =>
    h('output', {
      'data-client': 'connected',
      'data-workspace-prop': workspaceId,
      'data-handoff-scope': useMeetMailWorkspaceScope(workspaceId),
      'data-actor': useMailActor(),
    }),
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/mail-client', () => ({
  MailAppClient: ({ workspaceId }: { workspaceId: string }) =>
    h('output', {
      'data-client': 'managed',
      'data-workspace-prop': workspaceId,
      'data-handoff-scope': useMeetMailWorkspaceScope(workspaceId),
      'data-actor': useMailActor(),
    }),
}));
const wsId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const model = {
  kind: 'workspace',
  actorId,
  wsId,
  workspaceSlug: 'personal',
  profile: null,
  notificationWebAppUrl: 'https://tuturuuu.com',
  connectedByDefault: true,
  behavior: 'expanded',
  behaviorUpdatedAt: null,
  defaultCollapsed: false,
  workspace: {
    id: wsId,
    personal: true,
    creator_id: actorId,
    name: 'Workspace',
    avatar_url: null,
    logo_url: null,
    created_at: null,
    deleted: false,
    energy_profile: null,
    first_day_of_week: null,
    handle: null,
    scheduling_settings: null,
    timezone: null,
    joined: true,
    tier: null,
  },
} satisfies Parameters<typeof MailWorkspaceView>[0]['workspace'];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it.each([true, false])(
  'binds the verified UUID while retaining personal routing for connected=%s',
  (connectedByDefault) => {
    const { container } = render(
      h(MailWorkspaceView, {
        workspace: { ...model, connectedByDefault },
        locale: 'en',
      }),
      { wrapper: withNuqsTestingAdapter({ searchParams: {}, hasMemory: true }) }
    );
    const client = screen.getByRole('status');
    expect(client.getAttribute('data-client')).toBe(
      connectedByDefault ? 'connected' : 'managed'
    );
    expect(client.getAttribute('data-workspace-prop')).toBe('personal');
    expect(client.getAttribute('data-handoff-scope')).toBe(wsId);
    expect(client.getAttribute('data-actor')).toBe(actorId);
    expect(
      container
        .querySelector('[data-workspace-slug]')
        ?.getAttribute('data-workspace-slug')
    ).toBe('personal');
    expect(observed.structure).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId,
        personalOrWsId: 'personal',
        links: expect.arrayContaining([
          expect.objectContaining({ href: '/personal/inbox' }),
        ]),
      })
    );
    expect(observed.realtime).toHaveBeenCalledWith(wsId);
    expect(observed.identity).not.toHaveBeenCalled();
  }
);
