import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page, Response } from '@playwright/test';
import {
  observeProfileNavigation,
  profileNavigationRoute,
} from './lettin-profile-navigation-diagnostics';

const origin = 'http://127.0.0.1:7833';

test('routes become fixed classes without IDs, query values or external destinations', () => {
  assert.equal(
    profileNavigationRoute(
      `${origin}/00000000-0000-0000-0000-000000000000/profile?token=private`,
      origin
    ),
    'profile'
  );
  assert.equal(
    profileNavigationRoute(`${origin}/vi/login?next=private`, origin),
    'login'
  );
  assert.equal(
    profileNavigationRoute(`${origin}/verify-token?token=private`, origin),
    'verify-token'
  );
  assert.equal(
    profileNavigationRoute(`${origin}/dashboard`, origin),
    'dashboard'
  );
  assert.equal(
    profileNavigationRoute(`${origin}/private-path`, origin),
    'other-local'
  );
  assert.equal(
    profileNavigationRoute('https://private-host/login', origin),
    'external'
  );
  assert.equal(
    profileNavigationRoute('private-invalid', origin),
    'unparseable'
  );
});

test('navigation failure preserves the error, bounds hops and detaches its listener', async () => {
  let listener: ((response: Response) => void) | undefined;
  let removed = false;
  const frame = {};
  const page = {
    mainFrame: () => frame,
    on: (_event: string, callback: typeof listener) => {
      listener = callback;
    },
    off: (_event: string, callback: typeof listener) => {
      removed = callback === listener;
    },
  } as unknown as Page;
  const response = {
    request: () => ({ isNavigationRequest: () => true }),
    frame: () => frame,
    status: () => 307,
    url: () => `${origin}/login?private=secret`,
  } as unknown as Response;
  const failure = new Error('private failure');
  let captured: unknown;
  const warn = console.warn;
  console.warn = (_label, record) => {
    captured = record;
  };
  try {
    await assert.rejects(
      observeProfileNavigation(page, origin, async () => {
        for (let index = 0; index < 25; index++) listener?.(response);
        throw failure;
      }),
      (error) => error === failure
    );
    assert.deepEqual(captured, {
      hops: Array.from({ length: 20 }, () => ({ route: 'login', status: 307 })),
      truncated: true,
    });
    assert.doesNotMatch(JSON.stringify(captured), /private|secret/u);
    assert.equal(removed, true);
  } finally {
    console.warn = warn;
  }
});
