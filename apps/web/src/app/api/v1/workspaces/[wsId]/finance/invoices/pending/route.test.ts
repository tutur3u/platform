import { describe, expect, it } from 'vitest';
import { sanitizePendingInvoiceAvatarRows } from './route';

const BROKEN_SUPABASE_AVATAR_URL =
  'https://yjbjpmwbfimjcdsjxfst.supabase.co/storage/v1/object/public/avatars/bbaf2747-4452-4b56-910d-0b313f49843e';

describe('sanitizePendingInvoiceAvatarRows', () => {
  it('nulls invalid pending invoice avatar URLs without mutating other fields', () => {
    expect(
      sanitizePendingInvoiceAvatarRows([
        {
          user_id: 'user-1',
          user_name: 'Anh Vu',
          user_avatar_url: BROKEN_SUPABASE_AVATAR_URL,
          months_owed: '2026-06',
        },
        {
          user_id: 'user-2',
          user_name: 'Bich Ngan',
          user_avatar_url: 'https://example.com/avatar.png',
          months_owed: '2026-06',
        },
      ])
    ).toEqual([
      {
        user_id: 'user-1',
        user_name: 'Anh Vu',
        user_avatar_url: null,
        months_owed: '2026-06',
      },
      {
        user_id: 'user-2',
        user_name: 'Bich Ngan',
        user_avatar_url: 'https://example.com/avatar.png',
        months_owed: '2026-06',
      },
    ]);
  });
});
