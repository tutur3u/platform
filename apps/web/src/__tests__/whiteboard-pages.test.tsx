import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getTranslations: vi.fn(),
  getWorkspace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (...args: Parameters<typeof mocks.getTranslations>) =>
    mocks.getTranslations(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/whiteboards/[boardId]/custom-whiteboard',
  () => ({
    CustomWhiteboard: (props: Record<string, unknown>) => ({
      type: 'CustomWhiteboard',
      props,
    }),
  })
);

vi.mock('@/app/[locale]/(dashboard)/[wsId]/whiteboards/client', () => ({
  default: (props: Record<string, unknown>) => ({
    type: 'WhiteboardsList',
    props,
  }),
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/whiteboards/createWhiteboardDialog',
  () => ({
    default: (props: Record<string, unknown>) => ({
      type: 'CreateWhiteboardDialog',
      props,
    }),
  })
);

describe('whiteboard pages', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getWorkspace.mockResolvedValue({
      id: 'normalized-ws',
      personal: false,
      joined: true,
      tier: null,
    });
    mocks.getTranslations.mockResolvedValue((key: string) => key);
  });

  it('renders the whiteboard detail page without WorkspaceWrapper and uses the normalized workspace id', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        title: 'Board',
        snapshot: JSON.stringify({
          elements: [],
          appState: { viewBackgroundColor: '#ffffff' },
        }),
      },
      error: null,
    });
    const eqWorkspace = vi.fn().mockReturnValue({ single });
    const eqBoard = vi.fn().mockReturnValue({ eq: eqWorkspace });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: eqBoard,
        }),
      })),
    });

    const { default: WhiteboardPage } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/whiteboards/[boardId]/page'
    );
    const element = await WhiteboardPage({
      params: Promise.resolve({
        wsId: 'personal',
        boardId: '11111111-1111-4111-8111-111111111111',
      }),
    });

    expect(mocks.getWorkspace).toHaveBeenCalledWith('personal');
    expect(eqBoard).toHaveBeenCalledWith(
      'id',
      '11111111-1111-4111-8111-111111111111'
    );
    expect(eqWorkspace).toHaveBeenCalledWith('ws_id', 'normalized-ws');
    expect(element).toMatchObject({
      props: {
        wsId: 'normalized-ws',
        boardId: '11111111-1111-4111-8111-111111111111',
        boardName: 'Board',
      },
    });
  });
});
