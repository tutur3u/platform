import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  Suspense,
} from 'react';
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
  MiraDashboardClient: vi.fn(({ children }) => (
    <div data-testid="mira-dashboard">{children}</div>
  )),
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
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('./components/mira-dashboard-client', () => ({
  default: mocks.MiraDashboardClient,
}));

vi.mock('./components/dashboard-insights', () => ({
  default: () => <div data-testid="dashboard-insights" />,
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
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => true),
      withoutPermission: vi.fn(() => false),
    });
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

  it('renders when the creator still has effective workspace permissions', async () => {
    const Page = (await import('./page')).default;

    const result = await Page({
      params: Promise.resolve({ locale: 'en', wsId: 'workspace-1' }),
    });

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);

    const rootChildren = (result as ReactElement<{ children: ReactNode[] }>)
      .props.children;
    const miraDashboard = rootChildren.at(-1) as ReactElement<{
      children: ReactNode;
      currentUser: { id: string };
      initialAssistantName: string;
      wsId: string;
    }>;

    expect(isValidElement(rootChildren[0])).toBe(true);
    expect(isValidElement(rootChildren[1])).toBe(true);
    expect(miraDashboard.type).toBe(mocks.MiraDashboardClient);
    expect(miraDashboard.props.currentUser.id).toBe('creator-1');
    expect(miraDashboard.props.initialAssistantName).toBe('Mira');
    expect(miraDashboard.props.wsId).toBe('workspace-1');
    const insightsBoundary = miraDashboard.props.children as ReactElement<{
      children: ReactElement<{ userId: string; wsId: string }>;
    }>;
    expect(insightsBoundary.type).toBe(Suspense);
    expect(typeof insightsBoundary.props.children.type).toBe('function');
    expect(
      (insightsBoundary.props.children.type as { name: string }).name
    ).toBe('DashboardInsightsSlot');
    expect(insightsBoundary.props.children.props).toMatchObject({
      userId: 'creator-1',
      wsId: 'workspace-1',
    });
  });
});
