import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  MindDashboard: vi.fn(() => null),
  getWebMindWorkspaceContext: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/mind-ui/dashboard', () => ({
  MindDashboard: mocks.MindDashboard,
}));

vi.mock('@/lib/mind-workspace-context', () => ({
  getWebMindWorkspaceContext: mocks.getWebMindWorkspaceContext,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

describe('web Mind board page parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWebMindWorkspaceContext.mockResolvedValue({
      user: {
        email: 'user@example.com',
        id: 'user-1',
      },
      workspace: {
        id: 'workspace-1',
      },
      wsId: 'workspace-1',
    });
  });

  it('renders the selected board through the shared Mind dashboard using the web route prefix', async () => {
    const MindBoardPage = (await import('./page')).default;

    const result = await MindBoardPage({
      params: Promise.resolve({
        boardId: 'board-1',
        locale: 'en',
        wsId: 'personal',
      }),
    });

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(mocks.MindDashboard);
    expect(result.props).toMatchObject({
      hiveHref: '/personal/hive',
      initialBoardId: 'board-1',
      mindPrefix: '/mind',
      wsId: 'workspace-1',
    });
  });
});
