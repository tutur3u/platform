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
  ['personal', 1],
  ['team', 0],
] as const)(
  'counts only owned messages in the %s workspace',
  async (wsId, expected) => {
    mocks.admin.mockReset();
    const personalQuery = {
      eq: vi.fn(() => personalQuery),
      select: vi.fn(() => personalQuery),
      maybeSingle: async () => ({
        data: wsId === 'personal' ? { id: wsId } : null,
      }),
    };
    const messageQuery = {
      select: vi.fn(() => messageQuery),
      eq: vi.fn(async (column: string, value: string) => ({
        count: column === 'ai_chats.creator_id' && value === 'actor' ? 1 : 2,
      })),
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
