import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  CalendarPageShell: vi.fn(() => null),
  createAdminClient: vi.fn(),
  fetchUserWorkspaceCalendarGoogleTokenForClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  headers: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/ui/calendar-app/calendar-page-shell', () => ({
  CalendarPageShell: mocks.CalendarPageShell,
}));

vi.mock('@tuturuuu/utils/calendar-auth-token', () => ({
  fetchUserWorkspaceCalendarGoogleTokenForClient:
    mocks.fetchUserWorkspaceCalendarGoogleTokenForClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
  redirect: mocks.redirect,
}));

describe('web Calendar page parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.headers.mockResolvedValue(new Headers());
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        email: 'user@example.com',
        id: 'user-1',
      },
    });
    mocks.getWorkspace.mockResolvedValue({
      id: 'workspace-1',
      personal: false,
    });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.fetchUserWorkspaceCalendarGoogleTokenForClient.mockResolvedValue(
      null
    );
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null })),
            order: vi.fn(async () => ({ data: [] })),
          })),
        })),
      })),
    });
  });

  it('renders the shared Calendar shell inside apps/web instead of redirecting to the standalone host', async () => {
    const CalendarPage = (await import('./page')).default;

    const result = await CalendarPage({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
      searchParams: Promise.resolve({}),
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(mocks.CalendarPageShell);
    expect(result.props).toMatchObject({
      enableSmartScheduling: true,
      isPersonalWorkspace: false,
      locale: 'en',
      userId: 'user-1',
      workspace: {
        id: 'workspace-1',
      },
    });
  });
});
