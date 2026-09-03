import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  chatPanelProps: [] as Array<Record<string, unknown>>,
  mutationOptions: [] as Array<{
    mutationFn: (args: never) => Promise<unknown>;
  }>,
  transportOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: { mutationFn: (args: never) => Promise<unknown> }) => {
    mocks.mutationOptions.push(options);
    return { mutateAsync: vi.fn() };
  },
  useQuery: () => ({ data: { id: 'user-1' } }),
}));

vi.mock('@tuturuuu/ai/core', () => ({
  DefaultChatTransport: class {
    constructor(options: Record<string, unknown>) {
      mocks.transportOptions.push(options);
    }
  },
}));

vi.mock('@tuturuuu/ai/react', () => ({
  useChat: () => ({
    id: '33333333-3333-4333-8333-333333333333',
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
  }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: vi.fn(),
  updateAiChat: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/chat-list', () => ({ ChatList: () => null }));
vi.mock('@/components/chat-scroll-anchor', () => ({
  ChatScrollAnchor: () => null,
}));
vi.mock('@/components/empty-screen', () => ({ EmptyScreen: () => null }));
vi.mock('@/components/chat-panel', () => ({
  ChatPanel: (props: Record<string, unknown>) => {
    mocks.chatPanelProps.push(props);
    return null;
  },
}));

import Chat from './chat';

describe('Rewise chat workspace propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chatPanelProps.length = 0;
    mocks.mutationOptions.length = 0;
    mocks.transportOptions.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
          response: 'Summary',
          title: 'Title',
        }),
        ok: true,
      })
    );
  });

  it.each([WORKSPACE_A, WORKSPACE_B])(
    'uses only selected workspace %s for stream, title, summary, and attachments',
    async (wsId) => {
      render(<Chat locale="en" wsId={wsId} />);

      expect(mocks.transportOptions.at(-1)).toEqual(
        expect.objectContaining({
          body: expect.objectContaining({ wsId }),
        })
      );
      expect(mocks.chatPanelProps.at(-1)).toEqual(
        expect.objectContaining({ wsId })
      );

      await mocks.mutationOptions[0]!.mutationFn({
        id: 'chat-1',
        model: 'google/gemini-3-flash',
      } as never);
      await mocks.mutationOptions[1]!.mutationFn({
        id: 'chat-1',
        message: 'Hello',
        model: 'google/gemini-3-flash',
      } as never);

      const requestBodies = vi
        .mocked(fetch)
        .mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
      expect(requestBodies).toEqual([
        { id: 'chat-1', model: 'google/gemini-3-flash', wsId },
        {
          id: 'chat-1',
          message: 'Hello',
          model: 'google/gemini-3-flash',
          wsId,
        },
      ]);
    }
  );
});
