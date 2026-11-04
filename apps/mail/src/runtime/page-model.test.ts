import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  profile: vi.fn(),
  workspace: vi.fn(),
  invitation: vi.fn(),
  proxy: vi.fn(),
  login: vi.fn(),
}));
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
  getPendingWorkspaceInvitation: mocks.invitation,
}));
vi.mock('../proxy', () => ({ proxy: mocks.proxy }));
vi.mock('../app/[locale]/(auth)/login/page', () => ({ default: mocks.login }));

import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { MAIL_FOLDERS } from '../app/[locale]/(dashboard)/[wsId]/mail-folders';
import { MAIL_FUNCTION_BASE } from './mail-api-policy';
import { loadPageModel } from './page-model.server';
import { withMailRequest } from './request-context';

const tenant = '68b69ced-d116-452a-b9ea-8a5f068d362f';
function load(path: string, actualPath = '/en/personal/inbox') {
  return withMailRequest(
    {
      request: new Request(`https://mail.tuturuuu.com${actualPath}`),
      responseHeaders: new Headers(),
      waitUntil: () => {},
    },
    () => loadPageModel(path)
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    id: 'actor',
    email: 'staff@tuturuuu.com',
    access_token: 'must-not-serialize',
  });
  mocks.profile.mockResolvedValue({ id: 'actor', display_name: 'Actor' });
  mocks.workspace.mockResolvedValue({
    id: tenant,
    personal: false,
    joined: true,
  });
  mocks.invitation.mockResolvedValue(null);
  mocks.proxy.mockResolvedValue(NextResponse.next());
});
describe('Mail page authorization and projections', () => {
  it('resolves every folder in both locales and trims actor authentication objects', async () => {
    for (const prefix of ['', '/vi'])
      for (const folder of MAIL_FOLDERS) {
        const model = await load(`${prefix}/${tenant}/${folder}`);
        expect(model).toMatchObject({
          kind: 'folder',
          folder,
          actorId: 'actor',
          locale: prefix ? 'vi' : 'en',
          workspace: { wsId: tenant, connectedByDefault: false },
        });
        expect(JSON.stringify(model)).not.toContain('must-not-serialize');
        expect(mocks.workspace).toHaveBeenLastCalledWith(
          tenant,
          expect.objectContaining({
            useAdmin: true,
            user: expect.objectContaining({ id: 'actor' }),
          })
        );
      }
  });
  it('rejects anonymous callers before workspace or invitation reads', async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(load(`/${tenant}/inbox`)).rejects.toMatchObject({
      options: { href: '/login' },
    });
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.invitation).not.toHaveBeenCalled();
  });
  it('retains nonstaff personal-only policy and exact-domain check', async () => {
    for (const email of [
      'user@example.com',
      'staff@tuturuuu.com.attacker.example',
    ]) {
      mocks.actor.mockResolvedValue({ id: 'actor', email });
      await expect(load(`/${tenant}/inbox`)).rejects.toMatchObject({
        options: { href: '/not-available' },
      });
      expect(mocks.invitation).not.toHaveBeenCalled();
      mocks.workspace.mockResolvedValueOnce({
        id: tenant,
        personal: true,
        joined: true,
      });
      expect(await load('/personal/inbox')).toMatchObject({
        kind: 'folder',
        workspace: { connectedByDefault: true, workspaceSlug: 'personal' },
      });
    }
  });
  it('keeps invitation, missing workspace and nonmember branches distinct', async () => {
    const invitation = {
      id: 'invite',
      workspace: { id: tenant, name: 'Invited' },
    };
    mocks.workspace.mockResolvedValue({
      id: tenant,
      personal: false,
      joined: false,
    });
    mocks.invitation.mockResolvedValueOnce(invitation);
    expect(await load(`/${tenant}/inbox`)).toMatchObject({
      kind: 'invitation',
      invitation,
    });
    expect(mocks.profile).not.toHaveBeenCalled();
    await expect(load(`/${tenant}/inbox`)).rejects.toMatchObject({
      options: { href: '/' },
    });
    mocks.workspace.mockResolvedValue(null);
    await expect(load(`/${tenant}/inbox`)).rejects.toMatchObject({
      isNotFound: true,
    });
  });
  it('preserves home/workspace redirects, verify-token and unavailable branches', async () => {
    await expect(load('/')).rejects.toMatchObject({
      options: { href: '/personal/inbox' },
    });
    await expect(load('/vi/personal?mailbox=box')).rejects.toMatchObject({
      options: { href: `/vi/${tenant}/inbox?mailbox=box` },
    });
    expect(
      await load('/verify-token?nextUrl=%2Fpersonal%2Finbox')
    ).toMatchObject({ kind: 'verify-token' });
    expect(await load('/vi/not-available')).toMatchObject({
      kind: 'not-available',
      locale: 'vi',
    });
    await expect(load('/personal/inbox/extra')).rejects.toMatchObject({
      isNotFound: true,
    });
    await expect(load('/%ZZ/inbox')).rejects.toMatchObject({
      isNotFound: true,
    });
    await expect(
      load('https://attacker.example/personal/inbox')
    ).rejects.toThrow('Invalid Mail page origin');
  });
  it('passes login query to the canonical SSO page', async () => {
    const redirect = new Error('central SSO');
    mocks.login.mockRejectedValueOnce(redirect);
    await expect(load('/login?refresh=1&next=%2Fpersonal%2Fsent')).rejects.toBe(
      redirect
    );
    const call = mocks.login.mock.calls[0]?.[0];
    expect(await call.searchParams).toEqual({
      refresh: '1',
      next: '/personal/sent',
    });
  });
  it('runs document policy for native navigation and retains its redirect cookies', async () => {
    const denied = NextResponse.redirect('https://tuturuuu.com/login');
    denied.cookies.set('session', 'refreshed', { httpOnly: true });
    mocks.proxy.mockResolvedValueOnce(denied);
    const responseHeaders = new Headers();
    await expect(
      withMailRequest(
        {
          request: new Request(
            `https://mail.tuturuuu.com${MAIL_FUNCTION_BASE}/page`
          ),
          responseHeaders,
          waitUntil: () => {},
        },
        () => loadPageModel('/personal/inbox')
      )
    ).rejects.toMatchObject({
      options: { href: 'https://tuturuuu.com/login', statusCode: 307 },
    });
    expect(responseHeaders.getSetCookie()).toHaveLength(1);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it('retains refresh cookies when native page resolution redirects after middleware continuation', async () => {
    const middleware = NextResponse.next();
    middleware.cookies.set('app', 'refreshed', { httpOnly: true });
    mocks.proxy.mockResolvedValueOnce(middleware);
    const responseHeaders = new Headers();
    await expect(
      withMailRequest(
        {
          request: new Request(
            `https://mail.tuturuuu.com${MAIL_FUNCTION_BASE}/page`
          ),
          responseHeaders,
          waitUntil: () => {},
        },
        () => loadPageModel('/personal')
      )
    ).rejects.toMatchObject({ options: { href: `/${tenant}/inbox` } });
    expect(responseHeaders.getSetCookie()).toHaveLength(1);
    expect(responseHeaders.getSetCookie()[0]).toContain('app=refreshed');
  });
});
