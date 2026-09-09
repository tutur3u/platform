import { expect, it } from 'vitest';
import { normalizeAuthRedirectPath } from './redirect-path';

it('falls back when decoding a path produces an invalid URL authority', () => {
  expect(
    normalizeAuthRedirectPath('/%2f%5b', 'https://meet.tuturuuu.com')
  ).toBe('/');
});

it('keeps Meet room context through nested login aliases', () => {
  const origin = 'https://meet.tuturuuu.com';
  expect(normalizeAuthRedirectPath('/login?next=%2Fr%2Froom', origin)).toBe(
    '/r/room'
  );
  expect(
    normalizeAuthRedirectPath(
      '/verify-token?nextUrl=%2Flogin%3Fnext%3D%252Fr%252Froom',
      origin
    )
  ).toBe('/r/room');
  expect(
    normalizeAuthRedirectPath('/login?next=https%3A%2F%2Fevil.test', origin)
  ).toBe('/');
  expect(normalizeAuthRedirectPath('/login?next=%2Flogin', origin)).toBe('/');
});

it('preserves encoded query delimiters in direct and nested destinations', () => {
  const origin = 'https://meet.tuturuuu.com';
  const path = '/r/room?label=one%26two%23three';
  expect(normalizeAuthRedirectPath(path, origin)).toBe(path);
  expect(
    normalizeAuthRedirectPath(`/login?next=${encodeURIComponent(path)}`, origin)
  ).toBe(path);
  expect(normalizeAuthRedirectPath(encodeURIComponent(path), origin)).toBe(
    path
  );
});
