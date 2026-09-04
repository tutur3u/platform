import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getChats: vi.fn(),
  requireRewiseWorkspace: vi.fn(),
}));

vi.mock('./chat', () => ({ default: () => null }));
vi.mock('./helper', () => ({
  getChats: (...args: Parameters<typeof mocks.getChats>) =>
    mocks.getChats(...args),
  requireRewiseWorkspace: (
    ...args: Parameters<typeof mocks.requireRewiseWorkspace>
  ) => mocks.requireRewiseWorkspace(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

import ExistingChatPage from './c/[chatId]/page';
import ImaginePage from './imagine/page';
import NewChatPage from './new/page';
import WorkspaceAssistantPage from './page';

function createAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'ai_chats') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  creator_id: 'user-1',
                  id: 'chat-1',
                  is_public: false,
                  model: 'gemini-3-flash',
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'ai_chat_messages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      };
    }),
  };
}

describe('Rewise workspace page propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(createAdminClient());
    mocks.getChats.mockResolvedValue({ count: 0, data: [] });
  });

  it.each([
    ['workspace-a', WORKSPACE_A],
    ['workspace-b', WORKSPACE_B],
  ])(
    'passes canonical workspace %s through assistant, new, existing, and imagine pages',
    async (workspaceSlug, canonicalWsId) => {
      mocks.requireRewiseWorkspace.mockResolvedValue({
        user: { email: 'user@example.com', id: 'user-1' },
        workspace: { id: canonicalWsId, joined: true },
        wsId: canonicalWsId,
      });

      const assistant = (await WorkspaceAssistantPage({
        params: Promise.resolve({ wsId: workspaceSlug }),
        searchParams: Promise.resolve({ lang: 'en' }),
      })) as ReactElement<{ wsId: string }>;
      const newChat = (await NewChatPage({
        params: Promise.resolve({ wsId: workspaceSlug }),
        searchParams: Promise.resolve({ lang: 'en' }),
      })) as ReactElement<{ wsId: string }>;
      const imagine = (await ImaginePage({
        params: Promise.resolve({ wsId: workspaceSlug }),
        searchParams: Promise.resolve({ lang: 'en' }),
      })) as ReactElement<{ wsId: string }>;
      const existing = (await ExistingChatPage({
        params: Promise.resolve({ chatId: 'chat-1', wsId: workspaceSlug }),
        searchParams: Promise.resolve({ lang: 'en' }),
      })) as ReactElement<{ children: ReactElement<{ wsId: string }> }>;

      expect(assistant.props.wsId).toBe(canonicalWsId);
      expect(newChat.props.wsId).toBe(canonicalWsId);
      expect(imagine.props.wsId).toBe(canonicalWsId);
      expect(existing.props.children.props.wsId).toBe(canonicalWsId);
      expect(mocks.requireRewiseWorkspace).toHaveBeenCalledTimes(4);
      expect(mocks.requireRewiseWorkspace).toHaveBeenCalledWith(workspaceSlug);
    }
  );
});
