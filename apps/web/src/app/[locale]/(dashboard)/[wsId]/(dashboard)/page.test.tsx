import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The page opts into request-time rendering via `connection()` (required under
// cacheComponents). Unit tests invoke it outside a request scope, so stub it.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  verifySecret: vi.fn(),
  MiraDashboardClient: vi.fn(() => <div data-testid="mira-dashboard" />),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
  verifySecret: mocks.verifySecret,
}));

vi.mock('@/lib/tasks-app-url', () => ({
  getTasksAppOrigin: () => 'https://tasks.example',
}));

vi.mock('@/lib/calendar-app-url', () => ({
  getCalendarAppOrigin: () => 'https://calendar.example',
}));

vi.mock('@/lib/track-app-url', () => ({
  getTrackAppOrigin: () => 'https://track.example',
}));

vi.mock('@/lib/finance-app-url', () => ({
  getFinanceAppOrigin: () => 'https://finance.example',
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('./components/mira-dashboard-client', () => ({
  default: mocks.MiraDashboardClient,
}));

// The overview is a server component composed from shared client cards;
// these tests assert what the page passes to it.
vi.mock('./workspace-overview', () => ({
  WorkspaceOverview: () => null,
}));

vi.mock('./permission-setup-banner', () => ({
  default: () => <div data-testid="permission-setup-banner" />,
}));

vi.mock('./user-groups/quick-actions', () => ({
  default: () => <div data-testid="user-group-quick-actions" />,
}));

describe('WorkspaceHomePage dashboard access', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getCurrentUser.mockResolvedValue({
      email: 'creator@example.com',
      id: 'creator-1',
    });
    mocks.getWorkspace.mockResolvedValue({
      creator_id: 'creator-1',
      id: 'workspace-1',
      personal: false,
      timezone: 'Asia/Ho_Chi_Minh',
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => true),
      withoutPermission: vi.fn(() => false),
    });
    mocks.verifySecret.mockResolvedValue(false);
  });

  it('requires effective permissions even when the current user is the workspace creator', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);
    const Page = (await import('./page')).default;

    await expect(
      Page({
        params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
      })
    ).rejects.toThrow('not-found');

    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: {
        email: 'creator@example.com',
        id: 'creator-1',
      },
      wsId: 'workspace-1',
    });
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('renders the overview with Mira embedded and team slots', async () => {
    const Page = (await import('./page')).default;
    const { WorkspaceOverview } = await import('./workspace-overview');

    const result = (await Page({
      params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
    })) as ReactElement<OverviewProps>;

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(result.type).toBe(WorkspaceOverview);
    expect(result.props).toMatchObject({
      wsId: 'workspace-1',
      isPersonal: false,
      timeZone: 'Asia/Ho_Chi_Minh',
      cards: {
        showAgenda: true,
        showTasks: true,
        showTime: true,
        showFinance: true,
        canLogTransaction: true,
      },
      links: {
        tasksHref: 'https://tasks.example/workspace-1/tasks',
        calendarHref: 'https://calendar.example/workspace-1',
        trackHref: 'https://track.example/workspace-1',
        financeHref: 'https://finance.example/workspace-1',
        newTaskHref: 'https://tasks.example/workspace-1/tasks/new',
        logTransactionHref:
          'https://finance.example/workspace-1/transactions?create=transaction',
      },
    });
    expect(isValidElement(result.props.setup)).toBe(true);
    expect(isValidElement(result.props.groups)).toBe(true);

    const mira = result.props.mira as ReactElement<{
      currentUser: { id: string };
      initialAssistantName: string;
      variant: string;
      wsId: string;
    }>;
    expect(mira.type).toBe(mocks.MiraDashboardClient);
    expect(mira.props.currentUser.id).toBe('creator-1');
    expect(mira.props.initialAssistantName).toBe('Mira');
    expect(mira.props.variant).toBe('embedded');
    expect(mira.props.wsId).toBe('workspace-1');
  });

  it('mirrors the sidebar and Finance gates for each card', async () => {
    const Page = (await import('./page')).default;
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_projects'
      ),
      withoutPermission: vi.fn(),
    });

    const result = (await Page({
      params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
    })) as ReactElement<OverviewProps>;
    expect(result.props.cards).toEqual({
      showTasks: true,
      showAgenda: false,
      showTime: true,
      // Finance amounts only with view_transactions, never inferred.
      showFinance: false,
      canLogTransaction: false,
    });

    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(
        (permission: string) => permission === 'view_transactions'
      ),
      withoutPermission: vi.fn(),
    });
    mocks.verifySecret.mockResolvedValue(true);
    const aiOnly = (await Page({
      params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
    })) as ReactElement<OverviewProps>;
    expect(aiOnly.props.cards).toEqual({
      showTasks: false,
      showAgenda: false,
      showTime: true,
      showFinance: true,
      // Viewing transactions does not grant the create flow.
      canLogTransaction: false,
    });
    expect(mocks.verifySecret).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      forceAdmin: true,
      name: 'ENABLE_AI_ONLY',
      value: 'true',
    });
  });

  it('passes only a validated prompt draft to Mira, never sending it', async () => {
    const Page = (await import('./page')).default;
    const draftOf = async (prompt: string | string[] | undefined) => {
      const result = (await Page({
        params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
        searchParams: Promise.resolve({ prompt }),
      })) as ReactElement<OverviewProps>;
      return (result.props.mira as ReactElement<{ initialDraft?: string }>).props
        .initialDraft;
    };

    await expect(draftOf('  Plan my week ')).resolves.toBe('Plan my week');
    await expect(draftOf(['a', 'b'])).resolves.toBeUndefined();
    await expect(draftOf('x'.repeat(4001))).resolves.toBeUndefined();
    await expect(draftOf(undefined)).resolves.toBeUndefined();
  });

  it('omits team setup and group actions in personal workspaces', async () => {
    mocks.getWorkspace.mockResolvedValue({
      creator_id: 'creator-1',
      id: 'workspace-1',
      personal: true,
    });
    const Page = (await import('./page')).default;

    const result = (await Page({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
    })) as ReactElement<OverviewProps>;
    expect(result.props.isPersonal).toBe(true);
    expect(result.props.setup).toBeNull();
    expect(result.props.groups).toBeNull();
    expect(result.props.links.tasksHref).toBe(
      'https://tasks.example/personal/tasks'
    );
  });
});

interface OverviewProps {
  wsId: string;
  isPersonal: boolean;
  timeZone: string | null;
  cards: {
    showAgenda: boolean;
    showTasks: boolean;
    showTime: boolean;
    showFinance: boolean;
    canLogTransaction: boolean;
  };
  links: {
    tasksHref: string;
    calendarHref: string;
    trackHref: string;
    financeHref: string;
    newTaskHref: string;
    logTransactionHref: string;
  };
  setup: ReactNode;
  groups: ReactNode;
  mira: ReactNode;
}
