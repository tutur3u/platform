import { expect, it } from 'vitest';
import { normalizeAuthRedirectPath } from './redirect-path';

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
