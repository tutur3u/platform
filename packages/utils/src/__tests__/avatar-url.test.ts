import { describe, expect, it } from 'vitest';
import { normalizeAvatarImageSrc } from '../avatar-url';

const SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL =
  'https://yjbjpmwbfimjcdsjxfst.supabase.co/storage/v1/object/public/avatars/bbaf2747-4452-4b56-910d-0b313f49843e';

describe('normalizeAvatarImageSrc', () => {
  it('drops blank and unsafe avatar values', () => {
    expect(normalizeAvatarImageSrc(undefined)).toBeUndefined();
    expect(normalizeAvatarImageSrc(null)).toBeUndefined();
    expect(normalizeAvatarImageSrc('')).toBeUndefined();
    expect(normalizeAvatarImageSrc('   ')).toBeUndefined();
    expect(normalizeAvatarImageSrc('//example.com/avatar.png')).toBeUndefined();
  });

  it('drops bare UUID avatar object identifiers', () => {
    expect(
      normalizeAvatarImageSrc('bbaf2747-4452-4b56-910d-0b313f49843e')
    ).toBeUndefined();
  });

  it('keeps Supabase public avatar URLs even when the object key is a UUID', () => {
    expect(normalizeAvatarImageSrc(SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL)).toBe(
      SUPABASE_PUBLIC_BARE_UUID_AVATAR_URL
    );
  });

  it('keeps supported image source schemes and paths', () => {
    expect(normalizeAvatarImageSrc('https://example.com/avatar.png')).toBe(
      'https://example.com/avatar.png'
    );
    expect(normalizeAvatarImageSrc('/avatars/local.png')).toBe(
      '/avatars/local.png'
    );
    expect(normalizeAvatarImageSrc('blob:avatar.png')).toBe('blob:avatar.png');
    expect(normalizeAvatarImageSrc('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc'
    );
  });

  it('keeps real Supabase avatar object paths', () => {
    expect(
      normalizeAvatarImageSrc('avatars/user-1/avatar-1700000000000.png')
    ).toBe('avatars/user-1/avatar-1700000000000.png');
    expect(
      normalizeAvatarImageSrc(
        'https://hvgmshmjolwfcbsxmyku.supabase.co/storage/v1/object/public/avatars/00000000-0000-4000-8000-000000000001/1770694181366.jpg'
      )
    ).toBe(
      'https://hvgmshmjolwfcbsxmyku.supabase.co/storage/v1/object/public/avatars/00000000-0000-4000-8000-000000000001/1770694181366.jpg'
    );
  });
});
