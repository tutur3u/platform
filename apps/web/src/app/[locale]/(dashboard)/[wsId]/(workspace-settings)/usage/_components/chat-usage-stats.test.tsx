import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  session: vi.fn(),
  getPermissions: vi.fn(async ({ wsId }: { wsId: string }) => ({
    containsPermission: () => true,
    wsId,
  })),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.session,
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async () => ({
    user: { id: 'actor' },
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));
vi.mock('@/components/cards/StatisticCard', () => ({ default: () => null }));

import { ChatUsageStats } from './chat-usage-stats';

it.each([
  ['personal', 2],
  ['team', 0],
] as const)(
  'counts only owned non-shadow messages in the %s workspace',
  async (wsId, expected) => {
    mocks.admin.mockReset();
    const personalQuery = {
      eq: vi.fn(() => personalQuery),
      select: vi.fn(() => personalQuery),
      maybeSingle: async () => ({
        data: wsId === 'personal' ? { id: wsId } : null,
      }),
    };
    let owner: string | undefined;
    const summaries = [
      { owner: 'actor', summary: null },
      { owner: 'actor', summary: 'Regular summary' },
      { owner: 'actor', summary: 'native-chat-shadow:conversation' },
      { owner: 'other', summary: null },
    ];
    const messageQuery = {
      select: vi.fn(() => messageQuery),
      eq: vi.fn((column: string, value: string) => {
        if (column === 'ai_chats.creator_id') owner = value;
        return messageQuery;
      }),
      or: vi.fn(
        async (filter: string, options: { referencedTable: string }) => {
          expect(options.referencedTable).toBe('ai_chats');
          expect(filter).toBe(
            'summary.is.null,summary.not.like.native-chat-shadow:*'
          );
          return {
            count: summaries.filter(
              (row) =>
                row.owner === owner &&
                !row.summary?.startsWith('native-chat-shadow:')
            ).length,
          };
        }
      ),
    };
    const from = vi.fn(() => messageQuery);
    mocks.session.mockResolvedValue({ from: vi.fn(() => personalQuery) });
    mocks.admin.mockResolvedValue({ from });

    const card = await ChatUsageStats({ wsId });

    expect(card.props.value).toBe(expected);
    expect(personalQuery.eq).toHaveBeenCalledWith('id', wsId);
    expect(personalQuery.eq).toHaveBeenCalledWith('creator_id', 'actor');
    if (wsId === 'personal') {
      expect(from).toHaveBeenCalledWith('ai_chat_messages');
      expect(messageQuery.select).toHaveBeenCalledWith(
        expect.stringContaining('ai_chats!chat_id!inner(creator_id)'),
        { count: 'exact', head: true }
      );
    } else {
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  }
);
