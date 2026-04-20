import { describe, expect, it } from 'vitest';
import {
  normalizeInviteLinkDetails,
  normalizeInviteLinkUse,
} from './workspace-invite-links';

describe('workspace invite links normalization', () => {
  it('normalizes a nested user object into a stable user field', () => {
    const normalized = normalizeInviteLinkUse({
      id: 'use-1',
      user_id: 'user-1',
      joined_at: '2026-04-20T09:00:00.000Z',
      users: {
        id: 'user-1',
        display_name: 'Ada Lovelace',
        avatar_url: '/avatar.png',
        handle: 'ada',
      },
    });

    expect(normalized.user).toEqual({
      id: 'user-1',
      display_name: 'Ada Lovelace',
      avatar_url: '/avatar.png',
      handle: 'ada',
    });
  });

  it('normalizes an array-shaped relation and falls back when user data is missing', () => {
    const normalizedArray = normalizeInviteLinkUse({
      id: 'use-2',
      user_id: 'user-2',
      joined_at: '2026-04-20T10:00:00.000Z',
      users: [
        {
          id: 'user-2',
          display_name: null,
          avatar_url: null,
          handle: 'grace',
        },
      ],
    });

    expect(normalizedArray.user).toEqual({
      id: 'user-2',
      display_name: null,
      avatar_url: null,
      handle: 'grace',
    });

    const normalizedMissing = normalizeInviteLinkUse({
      id: 'use-3',
      user_id: 'user-3',
      joined_at: '2026-04-20T11:00:00.000Z',
      users: null,
    });

    expect(normalizedMissing.user).toEqual({
      id: 'user-3',
      display_name: null,
      avatar_url: null,
      handle: null,
    });
  });

  it('normalizes a full invite-link payload and defaults to an empty uses list', () => {
    const normalized = normalizeInviteLinkDetails({
      id: 'link-1',
      ws_id: 'ws-1',
      code: 'JOINME',
      creator_id: 'creator-1',
      max_uses: null,
      expires_at: null,
      created_at: '2026-04-20T08:00:00.000Z',
      current_uses: 1,
      is_expired: false,
      is_full: false,
      uses: [
        {
          id: 'use-4',
          user_id: 'user-4',
          joined_at: '2026-04-20T12:00:00.000Z',
          users: {
            id: 'user-4',
            display_name: 'Linus Torvalds',
            avatar_url: null,
            handle: 'linus',
          },
        },
      ],
    });

    expect(normalized.uses).toHaveLength(1);
    expect(normalized.uses[0]?.user.display_name).toBe('Linus Torvalds');

    const normalizedWithoutUses = normalizeInviteLinkDetails({
      id: 'link-2',
      ws_id: 'ws-2',
      code: 'EMPTY',
      creator_id: 'creator-2',
      max_uses: null,
      expires_at: null,
      created_at: '2026-04-20T13:00:00.000Z',
      current_uses: 0,
      is_expired: false,
      is_full: false,
    });

    expect(normalizedWithoutUses.uses).toEqual([]);
  });
});
