import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCentralLoginRedirect } from './central-login-redirect.mjs';

const returnUrl = 'https://rewise.tuturuuu.com/verify-token?nextUrl=%2F';
function response(
  destination = 'https://tuturuuu.com/login',
  target = returnUrl
) {
  const url = new URL(destination);
  url.searchParams.set('returnUrl', target);
  return { status: 307, location: url.href };
}

test('accepts centralized login with the complete app-session return target', () => {
  assertCentralLoginRedirect(response(), returnUrl);
  const queryReturn = `${returnUrl}%3Fsmoke%3Dreturn`;
  assertCentralLoginRedirect(response(undefined, queryReturn), queryReturn);
  const appRoot = 'https://rewise.tuturuuu.com/';
  assertCentralLoginRedirect(response(undefined, appRoot), appRoot);
});

test('rejects a wrong login destination or response status', () => {
  for (const target of [
    'https://unknown.example/login',
    'https://rewise.tuturuuu.com/login',
    'http://tuturuuu.com/login',
    'https://tuturuuu.com/wrong',
    'https://user@tuturuuu.com/login',
  ]) {
    assert.throws(() =>
      assertCentralLoginRedirect(response(target), returnUrl)
    );
  }
  for (const status of [200, 401, 500]) {
    assert.throws(() =>
      assertCentralLoginRedirect({ ...response(), status }, returnUrl)
    );
  }
});

test('rejects missing, duplicate, external or shortened returnUrl targets', () => {
  for (const target of [
    '',
    'https://unknown.example/verify-token?nextUrl=%2F',
    'https://tuturuuu.com/verify-token?nextUrl=%2F',
    'https://rewise.tuturuuu.com/',
    'https://rewise.tuturuuu.com/verify-token?nextUrl=%2Fwrong',
  ]) {
    assert.throws(() =>
      assertCentralLoginRedirect(response(undefined, target), returnUrl)
    );
  }
  assert.throws(() =>
    assertCentralLoginRedirect(
      { status: 307, location: 'https://tuturuuu.com/login' },
      returnUrl
    )
  );
  const duplicate = new URL(response().location);
  duplicate.searchParams.append('returnUrl', returnUrl);
  assert.throws(() =>
    assertCentralLoginRedirect(
      { status: 307, location: duplicate.href },
      returnUrl
    )
  );
});
