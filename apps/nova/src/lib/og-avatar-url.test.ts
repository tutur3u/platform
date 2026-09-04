import { describe, expect, it } from 'vitest';
import { getNovaOgAvatarUrl } from './og-avatar-url';

describe('getNovaOgAvatarUrl', () => {
  it.each([
    'https://project-one.supabase.co/storage/v1/object/public/avatars/user/avatar.png',
    'https://project-two.supabase.co/storage/v1/object/public/avatars/users/user-1/avatar.webp',
    'https://project-three.supabase.co/storage/v1/object/public/avatars/avatar.jpg?download=1',
    'https://project-four.supabase.co:443/storage/v1/object/public/avatars/avatar.jpg',
  ])('accepts approved public Supabase avatar objects: %s', (url) => {
    expect(getNovaOgAvatarUrl(url)).toBe(url);
  });

  it.each([
    ['', 'empty'],
    ['not a URL', 'malformed'],
    [
      '//project.supabase.co/storage/v1/object/public/avatars/a.png',
      'protocol-relative',
    ],
    [
      'http://project.supabase.co/storage/v1/object/public/avatars/a.png',
      'HTTP',
    ],
    ['data:image/png;base64,abc', 'data'],
    ['blob:https://project.supabase.co/id', 'blob'],
    ['file:///storage/v1/object/public/avatars/a.png', 'file'],
    ['https://localhost/storage/v1/object/public/avatars/a.png', 'localhost'],
    ['https://127.0.0.1/storage/v1/object/public/avatars/a.png', 'IPv4'],
    ['https://[::1]/storage/v1/object/public/avatars/a.png', 'IPv6'],
    [
      'https://supabase.co/storage/v1/object/public/avatars/a.png',
      'bare parent host',
    ],
    [
      'https://nested.project.supabase.co/storage/v1/object/public/avatars/a.png',
      'nested subdomain',
    ],
    [
      'https://supabase.co.example.test/storage/v1/object/public/avatars/a.png',
      'suffix confusion',
    ],
    [
      'https://project.supabase.co.example.test/storage/v1/object/public/avatars/a.png',
      'lookalike host',
    ],
    [
      'https://not-supabase.co/storage/v1/object/public/avatars/a.png',
      'substring host',
    ],
    [
      'https://user@project.supabase.co/storage/v1/object/public/avatars/a.png',
      'username',
    ],
    [
      'https://user:pass@project.supabase.co/storage/v1/object/public/avatars/a.png',
      'credentials',
    ],
    [
      'https://project.supabase.co:8443/storage/v1/object/public/avatars/a.png',
      'non-default port',
    ],
    [
      'https://project.supabase.co/storage/v1/object/public/avatars/',
      'empty object path',
    ],
    [
      'https://project.supabase.co/storage/v1/object/public/avatars//',
      'separator-only object path',
    ],
    [
      'https://project.supabase.co/storage/v1/object/private/avatars/a.png',
      'private bucket',
    ],
    [
      'https://project.supabase.co/storage/v1/object/public/avatar/a.png',
      'alternate path',
    ],
    [
      'https://project.supabase.co/storage/v1/object/v1/public/avatars/a.png',
      'malformed legacy path',
    ],
    [
      'https://project.supabase.co/storage/v1/object/public/avatars%2Fa.png',
      'encoded prefix separator',
    ],
    [
      'https://project.supabase.co/storage/v1/object/public/avatars/%2Fetc.png',
      'encoded object separator',
    ],
    [
      'https://project.supabase.co/storage/v1/object/public/avatars/%2e%2e/secret.png',
      'encoded traversal',
    ],
    [
      ' https://project.supabase.co/storage/v1/object/public/avatars/a.png',
      'leading whitespace',
    ],
  ])('rejects %s values (%s)', (url) => {
    expect(getNovaOgAvatarUrl(url)).toBeNull();
  });

  it('never throws for arbitrary strings', () => {
    for (const value of [
      '\0',
      '\ud800',
      'https://',
      '::::',
      '/relative/avatar.png',
      'https://.supabase.co/storage/v1/object/public/avatars/a.png',
    ]) {
      expect(() => getNovaOgAvatarUrl(value)).not.toThrow();
      expect(getNovaOgAvatarUrl(value)).toBeNull();
    }
  });
});
