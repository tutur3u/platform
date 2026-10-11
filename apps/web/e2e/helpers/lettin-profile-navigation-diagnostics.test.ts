import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page, Response } from '@playwright/test';
import {
  observeProfileNavigation,
  profileNavigationEdge,
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
    request: () => ({
      isNavigationRequest: () => true,
      redirectedTo: () => null,
    }),
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
      hops: Array.from({ length: 20 }, () => ({
        route: 'login',
        locale: 'unprefixed',
        targetRoute: 'unavailable',
        targetLocale: 'unavailable',
        samePath: null,
        status: 307,
      })),
      truncated: true,
    });
    assert.doesNotMatch(JSON.stringify(captured), /private|secret/u);
    assert.equal(removed, true);
  } finally {
    console.warn = warn;
  }
});

test('redirect edges distinguish locale cycles without exposing URL data', () => {
  const path = '/00000000-0000-0000-0000-000000000000/profile';
  assert.deepEqual(
    profileNavigationEdge(
      `${origin}${path}?token=private`,
      `${origin}/en${path}?token=secret`,
      origin
    ),
    {
      route: 'profile',
      locale: 'unprefixed',
      targetRoute: 'profile',
      targetLocale: 'en',
      samePath: false,
    }
  );
  assert.equal(
    profileNavigationEdge(
      `${origin}${path}?token=private`,
      `${origin}${path}?token=secret`,
      origin
    ).samePath,
    true
  );
  const external = profileNavigationEdge(
    `${origin}${path}`,
    'https://private-host/vi/profile?secret=private',
    origin
  );
  assert.equal(external.targetRoute, 'external');
  assert.equal(external.targetLocale, 'external');
  assert.doesNotMatch(JSON.stringify(external), /private|secret|00000000/u);
});

test('failed navigation reads the redirect edge assigned after the response event', async () => {
  let listener: ((response: Response) => void) | undefined;
  let destination: string | undefined;
  let removed = false;
  const frame = {};
  const path = '/00000000-0000-0000-0000-000000000000/profile';
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
    request: () => ({
      isNavigationRequest: () => true,
      redirectedTo: () =>
        destination === undefined ? null : { url: () => destination },
    }),
    frame: () => frame,
    status: () => 307,
    url: () => `${origin}${path}?private=secret`,
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
        listener?.(response);
        destination = `${origin}/vi${path}?token=private`;
        throw failure;
      }),
      (error) => error === failure
    );
    assert.deepEqual(captured, {
      hops: [
        {
          route: 'profile',
          locale: 'unprefixed',
          targetRoute: 'profile',
          targetLocale: 'vi',
          samePath: false,
          status: 307,
        },
      ],
      truncated: false,
    });
    assert.doesNotMatch(JSON.stringify(captured), /private|secret|00000000/u);
    assert.equal(removed, true);
  } finally {
    console.warn = warn;
  }
});
