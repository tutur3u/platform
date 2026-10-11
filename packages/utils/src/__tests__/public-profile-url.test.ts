import { expect, it } from 'vitest';
import {
  getPublicProfilePath,
  getPublicProfileUrl,
} from '../public-profile-url';

it('builds canonical profile links including readable legacy usernames', () => {
  expect(getPublicProfilePath('Creator_Name')).toBe('/u/creator_name');
  expect(getPublicProfilePath('a')).toBe('/u/a');
  expect(getPublicProfileUrl('creator')).toBe('https://tuturuuu.com/u/creator');
});
it.each([
  null,
  undefined,
  '',
  ' ',
  '../person',
  'user@example.com',
  'creator?private=1',
  'a'.repeat(101),
])('omits missing or invalid usernames %s', (username) => {
  expect(getPublicProfilePath(username)).toBeNull();
  expect(getPublicProfileUrl(username)).toBeNull();
});
it('preserves a configured origin without carrying private path or query state', () => {
  expect(
    getPublicProfileUrl(
      'creator',
      'http://platform.localhost:7803/vi/login?token=private#secret'
    )
  ).toBe('http://platform.localhost:7803/u/creator');
});
it.each([
  'javascript:alert(1)',
  'https://user:password@example.com',
  'invalid',
  '/login',
])('rejects unsafe central origins %s', (base) => {
  expect(getPublicProfileUrl('creator', base)).toBeNull();
});
