import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveCoMemberNames: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: mocks.resolveCoMemberNames,
}));

import { withCoMemberDisplayNames } from './co-member-display-names';

const WS_ID = '00000000-0000-4000-8000-000000004131';
const VIEWER_ID = '00000000-0000-4000-8000-000000004132';
const TARGET_ID = '00000000-0000-4000-8000-000000004133';
const ADMIN = { name: 'admin-client' };

function guildMember() {
  return {
    discord_user_id: 'synthetic-discord-user-1',
    id: 'guild-member-1',
    users: {
      avatar_url: null,
      display_name: null,
      handle: 'nameless',
      id: TARGET_ID,
    },
  };
}

describe('workspace Discord guild member names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(ADMIN);
  });

  it('names a nameless co-member by email for a member viewer', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[TARGET_ID, 'nameless@example.com']])
    );

    const [row] = await withCoMemberDisplayNames({
      rows: [guildMember()],
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(row?.users?.display_name).toBe('nameless@example.com');
    expect(row?.users).not.toHaveProperty('email');
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        viewerUserId: VIEWER_ID,
        wsId: WS_ID,
      })
    );
  });

  it('keeps no email when the helper withholds it (HIDE_MEMBER_EMAIL or guest viewer)', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[TARGET_ID, 'nameless']])
    );

    const [row] = await withCoMemberDisplayNames({
      rows: [guildMember()],
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(row?.users?.display_name).toBeNull();
    expect(JSON.stringify(row)).not.toContain('@example.com');
  });
});
