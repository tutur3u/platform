import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import vn from '../../../../messages/vi.json';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  invitations: vi.fn(),
  workspaces: vi.fn(),
  permission: vi.fn(),
  redirect: vi.fn(),
  locale: 'en',
  headers: new Headers(),
}));

vi.mock('@tuturuuu/icons', () => ({ CreditCard: () => null }));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: mocks.actor,
}));
vi.mock('@tuturuuu/payment-core/billing-helper', () => ({
  checkManageSubscriptionPermission: mocks.permission,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaces: mocks.workspaces,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitations: mocks.invitations,
  SatelliteWorkspaceInvitationList: ({
    afterDeclineHref,
  }: {
    afterDeclineHref: string;
  }) => <a href={afterDeclineHref}>Pending invitations</a>,
}));
vi.mock('next/headers', () => ({ headers: async () => mocks.headers }));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => mocks.locale,
  getTranslations: async () => (key: keyof (typeof en)['pay-dashboard']) =>
    (mocks.locale === 'vi' ? vn : en)['pay-dashboard'][key],
}));
vi.mock('@/constants/common', () => ({
  WEB_APP_URL: 'https://tuturuuu.com',
}));
vi.mock('@/i18n/navigation', () => ({
  redirect: mocks.redirect,
  Link: ({ href, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={`/${mocks.locale}${href}`} />
  ),
}));

import DashboardEntryPage from './page';

const actor = { user: { id: 'user-1' }, admin: { role: 'admin-client' } };
const personal = { id: 'ws-personal', name: 'Personal', personal: true };
const team = { id: 'ws-team', name: 'Team', personal: false };
const denied = { id: 'ws-denied', name: 'No billing access', personal: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.locale = 'en';
  mocks.actor.mockResolvedValue(actor);
  mocks.invitations.mockResolvedValue([]);
  mocks.workspaces.mockResolvedValue([]);
  mocks.permission.mockResolvedValue(true);
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});
afterEach(cleanup);

describe('Pay dashboard workspace entry', () => {
  it.each([personal, team])(
    'opens the only eligible workspace: $name',
    async (workspace) => {
      mocks.workspaces.mockResolvedValue([workspace]);
      await expect(DashboardEntryPage()).rejects.toThrow('NEXT_REDIRECT');
      expect(mocks.actor).toHaveBeenCalledWith('pay');
      expect(mocks.workspaces).toHaveBeenCalledWith({ user: actor.user });
      expect(mocks.permission).toHaveBeenCalledWith(
        actor.admin,
        workspace.id,
        actor.user.id
      );
      expect(mocks.redirect).toHaveBeenCalledWith({
        href: `/${workspace.id}/billing`,
        locale: 'en',
      });
    }
  );

  it.each(['en', 'vi'])(
    'renders eligible billing links in %s',
    async (locale) => {
      mocks.locale = locale;
      mocks.workspaces.mockResolvedValue([personal, denied, team]);
      mocks.permission.mockImplementation(
        async (_admin, wsId) => wsId !== denied.id
      );
      render(await DashboardEntryPage());
      expect(screen.getAllByRole('link')).toHaveLength(2);
      expect(
        screen.getByRole('link', { name: 'Personal' }).getAttribute('href')
      ).toBe(`/${locale}/ws-personal/billing`);
      expect(
        screen.getByRole('link', { name: 'Team' }).getAttribute('href')
      ).toBe(`/${locale}/ws-team/billing`);
      expect(screen.queryByText(denied.name)).toBeNull();
      expect(mocks.redirect).not.toHaveBeenCalled();
    }
  );

  it('counts only permitted workspaces for the direct redirect', async () => {
    mocks.workspaces.mockResolvedValue([denied, team]);
    mocks.permission.mockImplementation(
      async (_admin, wsId) => wsId === team.id
    );
    await expect(DashboardEntryPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: '/ws-team/billing',
      locale: 'en',
    });
  });

  it.each([{ workspaces: [] }, { workspaces: [denied] }])(
    'offers a next action with no eligible workspaces (%j)',
    async ({ workspaces }) => {
      mocks.workspaces.mockResolvedValue(workspaces);
      mocks.permission.mockResolvedValue(false);
      render(await DashboardEntryPage());
      expect(
        screen.getByText(en['pay-dashboard']['no-workspaces'])
      ).toBeTruthy();
      expect(screen.getAllByRole('link')).toHaveLength(1);
      expect(
        screen
          .getByRole('link', { name: en['pay-dashboard']['create-or-join'] })
          .getAttribute('href')
      ).toBe('https://tuturuuu.com/en');
      expect(screen.queryByText(denied.name)).toBeNull();
    }
  );

  it('keeps pending invitations ahead of workspace discovery', async () => {
    const invitations = [{ workspace: { id: 'invite-1' } }];
    mocks.invitations.mockResolvedValue(invitations);
    mocks.workspaces.mockResolvedValue([team]);
    const page = await DashboardEntryPage();
    expect(page.props.invitations).toBe(invitations);
    render(page);
    expect(
      screen
        .getByRole('link', { name: 'Pending invitations' })
        .getAttribute('href')
    ).toBe('/dashboard');
    expect(mocks.invitations).toHaveBeenCalledWith(mocks.headers);
    expect(mocks.workspaces).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('sends unauthenticated users to login before reading private data', async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(DashboardEntryPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: '/login?next=/dashboard',
      locale: 'en',
    });
    expect(mocks.invitations).not.toHaveBeenCalled();
    expect(mocks.workspaces).not.toHaveBeenCalled();
  });

  it('does not turn failed workspace discovery into an empty state', async () => {
    mocks.workspaces.mockResolvedValue(null);
    await expect(DashboardEntryPage()).rejects.toThrow(
      'Failed to load Pay workspaces'
    );
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('does not skip invitations on an unexpected invitation lookup failure', async () => {
    mocks.invitations.mockRejectedValue(
      new Error('Invitation service unavailable')
    );
    await expect(DashboardEntryPage()).rejects.toThrow(
      'Invitation service unavailable'
    );
    expect(mocks.workspaces).not.toHaveBeenCalled();
  });
});
