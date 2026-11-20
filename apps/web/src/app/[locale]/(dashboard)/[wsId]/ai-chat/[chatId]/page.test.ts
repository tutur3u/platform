import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
  resolveUser: vi.fn(async () => ({ user: { id: 'actor' } })),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(async () => ({})),
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ withoutPermission: () => false }),
  verifyHasSecrets: async () => true,
}));
vi.mock('../chat', () => ({ default: () => null }));
vi.mock('../helper', () => ({ listOwnedChats: vi.fn() }));

import AIPage from './page';

it('returns not found for a chat owned by another actor without reading messages', async () => {
  const foreignChat = { id: 'chat-id', creator_id: 'other-actor' };
  let owner: string | undefined;
  const query = {
    eq: vi.fn((column: string, value: string) => {
      if (column === 'creator_id') owner = value;
      return query;
    }),
    select: vi.fn(() => query),
    maybeSingle: async () => ({
      data: owner === foreignChat.creator_id ? foreignChat : null,
      error: null,
    }),
  };
  const from = vi.fn((table: string) => {
    if (table !== 'ai_chats') throw new Error('Unauthorized message query');
    return query;
  });
  mocks.admin.mockResolvedValue({ from });

  await expect(
    AIPage({
      params: Promise.resolve({ chatId: foreignChat.id, wsId: 'workspace-id' }),
      searchParams: Promise.resolve({ lang: 'en' }),
    })
  ).rejects.toThrow('not found');

  expect(query.eq).toHaveBeenCalledWith('creator_id', 'actor');
  expect(from.mock.calls).toEqual([['ai_chats']]);
});
