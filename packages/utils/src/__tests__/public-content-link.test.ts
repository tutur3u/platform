import { expect, it } from 'vitest';
import {
  getPublicContentLink,
  safePublicContentLink,
} from '../public-content-link';

const id = '00000000-0000-4000-8000-000000000001',
  entry = '00000000-0000-4000-8000-000000000002';
it('builds canonical profiles and notebook/entry links with no identity or tracking extras', () => {
  expect(
    getPublicContentLink({ type: 'profile', username: 'Creator_Name' })
  ).toBe('https://tuturuuu.com/u/creator_name');
  expect(getPublicContentLink({ type: 'notebook', worldId: id })).toBe(
    `https://lettin.tuturuuu.com/worlds/${id}`
  );
  expect(
    getPublicContentLink({ type: 'notebook', worldId: id, entryId: entry })
  ).toBe(`https://lettin.tuturuuu.com/worlds/${id}?entry=${entry}`);
});
it.each([
  'https://tuturuuu.com/workspace/settings',
  'https://lettin.tuturuuu.com/workspace/wiki/world',
  'https://example.com/u/creator',
  'http://tuturuuu.com/u/creator',
  'https://user:password@tuturuuu.com/u/creator',
  'https://tuturuuu.com/u/creator?email=private',
  'https://tuturuuu.com/u/creator#private',
  'https://tuturuuu.com/u/%2fprivate',
  `https://lettin.tuturuuu.com/worlds/${id}?actor=private`,
  `https://lettin.tuturuuu.com/worlds/${id}?entry=${entry}&entry=${entry}`,
  `https://lettin.tuturuuu.com/worlds/${id}?entry=`,
  `https://lettin.tuturuuu.com/worlds/${id}/private`,
])('rejects unsafe/private destination %s', (url) => {
  expect(safePublicContentLink(url)).toBeNull();
});
it('validates source identifiers and round-trips the canonical allowlist', () => {
  expect(getPublicContentLink({ type: 'notebook', worldId: 'bad' })).toBeNull();
  expect(
    getPublicContentLink({ type: 'notebook', worldId: id, entryId: 'bad' })
  ).toBeNull();
  expect(
    getPublicContentLink({ type: 'profile', username: '../private' })
  ).toBeNull();
  for (const url of [
    `https://tuturuuu.com/u/creator`,
    `https://lettin.tuturuuu.com/worlds/${id}?entry=${entry}`,
  ])
    expect(safePublicContentLink(url)).toBe(url);
  expect(safePublicContentLink(null)).toBeNull();
});

it('rejects malformed URLs and unsupported profile paths without throwing', () => {
  for (const value of [
    'not a URL',
    '',
    'https://tuturuuu.com/u/',
    'https://tuturuuu.com/u/creator/private',
  ]) {
    expect(safePublicContentLink(value)).toBeNull();
  }
});
it('canonicalizes notebook identifiers without adding an entry selection', () => {
  const uppercase = 'ABCDEFAB-1234-4ABC-8DEF-123456789ABC';
  expect(
    safePublicContentLink(`https://lettin.tuturuuu.com/worlds/${uppercase}`)
  ).toBe(`https://lettin.tuturuuu.com/worlds/${uppercase.toLowerCase()}`);
});
