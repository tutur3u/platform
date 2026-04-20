import { describe, expect, it } from 'vitest';
import { normalizeRoleMembers } from './workspace-role-members';

describe('workspace role members normalization', () => {
  it('normalizes a direct nested user object', () => {
    const normalized = normalizeRoleMembers([
      {
        user_id: 'user-1',
        users: {
          id: 'user-1',
          display_name: 'Ada Lovelace',
          avatar_url: '/avatar.png',
          user_private_details: [{ email: 'ada@example.com' }],
        },
      },
    ]);

    expect(normalized).toEqual([
      {
        id: 'user-1',
        display_name: 'Ada Lovelace',
        avatar_url: '/avatar.png',
        email: 'ada@example.com',
      },
    ]);
  });

  it('normalizes array-shaped nested relations and falls back to user_id', () => {
    const normalized = normalizeRoleMembers([
      {
        user_id: 'user-2',
        users: [
          {
            id: 'user-2',
            display_name: null,
            avatar_url: null,
            user_private_details: {
              email: 'grace@example.com',
            },
          },
        ],
      },
      {
        user_id: 'user-3',
        users: null,
      },
    ]);

    expect(normalized).toEqual([
      {
        id: 'user-2',
        display_name: null,
        avatar_url: null,
        email: 'grace@example.com',
      },
      {
        id: 'user-3',
        display_name: null,
        avatar_url: null,
        email: null,
      },
    ]);
  });
});
