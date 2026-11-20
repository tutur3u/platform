import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lmsArea, lmsLoginDestination } from './routing.ts';

for (const [path, area] of [
  ['/lms/teach', 'TEACH'],
  ['/lms/teach/w/courses/course/lesson', 'TEACH'],
  ['/lms/learn/api/v1/tulearn/bootstrap', 'LEARN'],
  ['/lms/learn/vi/parent-invite', 'LEARN'],
  ['/lms/teacher', undefined],
  ['/lms', undefined],
  ['/lms/assets/chunk.js', undefined],
] as const) {
  test(`selects the runtime for ${path}`, () =>
    assert.equal(lmsArea(path), area));
}

for (const [next, expected] of [
  ['/lms/learn/w/parent-invite?x=1&x=2', '/lms/learn/w/parent-invite?x=1&x=2'],
  ['//evil.example/lms', '/lms'],
  ['/lms/../account', '/lms'],
  ['/lms/login', '/lms'],
  ['/lms-extra', '/lms'],
]) {
  test(`normalizes the Web login continuation for ${next}`, () => {
    const login = lmsLoginDestination(next ?? null);
    const verify = new URL(login.searchParams.get('returnUrl') ?? '');
    assert.equal(login.origin, 'https://tuturuuu.com');
    assert.equal(login.pathname, '/login');
    assert.equal(verify.origin, login.origin);
    assert.equal(verify.pathname, '/verify-token');
    assert.equal(verify.searchParams.get('nextUrl'), expected);
  });
}
