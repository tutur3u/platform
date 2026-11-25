import { beforeEach, describe, expect, it, vi } from 'vitest';

// The pages opt into request-time rendering via `connection()` (required under
// cacheComponents). Unit tests invoke them outside a request scope, so stub it.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const mocks = vi.hoisted(() => ({
  getWhiteboardsWorkspace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('@/lib/workspace', () => ({
  getWhiteboardsWorkspace: (
    ...args: Parameters<typeof mocks.getWhiteboardsWorkspace>
  ) => mocks.getWhiteboardsWorkspace(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
}));

vi.mock('@/features/whiteboards/whiteboard-board-view', () => ({
  WhiteboardBoardView: (props: Record<string, unknown>) => ({
    type: 'WhiteboardBoardView',
    props,
  }),
}));

vi.mock('@/features/whiteboards/whiteboards-page-view', () => ({
  WhiteboardsPageView: (props: Record<string, unknown>) => ({
    type: 'WhiteboardsPageView',
    props,
  }),
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';

describe('whiteboards pages', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getWhiteboardsWorkspace.mockResolvedValue({
      id: 'normalized-ws',
      personal: false,
      joined: true,
      tier: null,
    });
  });

  it('lists boards for the normalized workspace id', async () => {
    const { default: WhiteboardsPage } =
      await import('@/app/[locale]/(dashboard)/[wsId]/page');
    const element = await WhiteboardsPage({
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(mocks.getWhiteboardsWorkspace).toHaveBeenCalledWith('personal');
    expect(element).toMatchObject({ props: { wsId: 'normalized-ws' } });
  });

  it('answers not found when the workspace is unknown to the actor', async () => {
    mocks.getWhiteboardsWorkspace.mockResolvedValue(null);
    const { default: WhiteboardsPage } =
      await import('@/app/[locale]/(dashboard)/[wsId]/page');

    await expect(
      WhiteboardsPage({ params: Promise.resolve({ wsId: 'nope' }) })
    ).rejects.toThrow('notFound');
  });

  it('renders the editor with the normalized workspace id and the board id', async () => {
    const { default: WhiteboardPage } =
      await import('@/app/[locale]/(dashboard)/[wsId]/[boardId]/page');
    const element = await WhiteboardPage({
      params: Promise.resolve({ wsId: 'personal', boardId: BOARD_ID }),
    });

    expect(mocks.getWhiteboardsWorkspace).toHaveBeenCalledWith('personal');
    expect(element).toMatchObject({
      props: { wsId: 'normalized-ws', boardId: BOARD_ID },
    });
  });

  it('answers not found for a board id that is not a UUID, before any lookup', async () => {
    const { default: WhiteboardPage } =
      await import('@/app/[locale]/(dashboard)/[wsId]/[boardId]/page');

    await expect(
      WhiteboardPage({
        params: Promise.resolve({ wsId: 'personal', boardId: 'not-a-uuid' }),
      })
    ).rejects.toThrow('notFound');
    expect(mocks.getWhiteboardsWorkspace).not.toHaveBeenCalled();
  });
});
