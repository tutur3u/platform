import assert from 'node:assert/strict';
import { Console } from 'node:console';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import test from 'node:test';
import type { Page, Response } from '@playwright/test';
import {
  observeProfileNavigation,
  profileNavigationEdge,
  profileNavigationRoute,
  profileProxyProvenance,
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
      if (_event === 'response') listener = callback;
    },
    off: (_event: string, callback: typeof listener) => {
      if (_event === 'response') removed = callback === listener;
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
    assert.equal(typeof record, 'string');
    captured = JSON.parse(record);
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
      lifecycle: { domContentLoaded: false, load: false },
      hops: Array.from({ length: 20 }, () => ({
        route: 'login',
        locale: 'unprefixed',
        targetRoute: 'unavailable',
        targetLocale: 'unavailable',
        samePath: null,
        sameOrigin: null,
        status: 307,
        body: 'unavailable',
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
      sameOrigin: true,
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
  assert.equal(external.sameOrigin, false);
  assert.equal(external.samePath, false);
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
      if (_event === 'response') listener = callback;
    },
    off: (_event: string, callback: typeof listener) => {
      if (_event === 'response') removed = callback === listener;
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
    assert.equal(typeof record, 'string');
    captured = JSON.parse(record);
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
      lifecycle: { domContentLoaded: false, load: false },
      hops: [
        {
          route: 'profile',
          locale: 'unprefixed',
          targetRoute: 'profile',
          targetLocale: 'vi',
          samePath: false,
          sameOrigin: true,
          status: 307,
          body: 'unavailable',
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

test('proxy provenance accepts only fixed categories and rejects arbitrary header contents', () => {
  assert.deepEqual(
    profileProxyProvenance('canonical-locale|unprefixed|en|different'),
    {
      proxy: {
        stage: 'canonical-locale',
        requestLocale: 'unprefixed',
        nextLocale: 'en',
        sameRequestPath: false,
      },
    }
  );
  assert.deepEqual(profileProxyProvenance('intl|unprefixed|unprefixed|same'), {
    proxy: {
      stage: 'intl',
      requestLocale: 'unprefixed',
      nextLocale: 'unprefixed',
      sameRequestPath: true,
    },
  });
  for (const value of [
    undefined,
    '',
    'private|secret',
    'intl|en|vi|same|token',
    'unknown|en|vi|same',
  ])
    assert.deepEqual(profileProxyProvenance(value), {});
});

test('same profile path on another origin is distinguished without exposing its host', () => {
  const path = '/00000000-0000-0000-0000-000000000000/profile';
  const edge = profileNavigationEdge(
    `${origin}${path}`,
    `https://private-host${path}`,
    origin
  );
  assert.equal(edge.sameOrigin, false);
  assert.equal(edge.samePath, false);
  assert.doesNotMatch(JSON.stringify(edge), /private-host|00000000/u);
});

test('real console output retains nested fixed producer categories without private data', async () => {
  let listener: ((response: Response) => void) | undefined;
  const frame = {};
  const path = '/00000000-0000-0000-0000-000000000000/profile';
  const page = {
    mainFrame: () => frame,
    on: (_event: string, callback: typeof listener) => {
      if (_event === 'response') listener = callback;
    },
    off: () => {},
  } as unknown as Page;
  const response = {
    request: () => ({
      isNavigationRequest: () => true,
      redirectedTo: () => ({ url: () => `${origin}${path}?token=private` }),
    }),
    frame: () => frame,
    status: () => 307,
    url: () => `${origin}${path}?secret=private`,
    headers: () => ({
      'x-lettin-profile-proxy': 'canonical-locale|unprefixed|en|different',
      'x-private': 'private-secret',
    }),
  } as unknown as Response;
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const capturedConsole = new Console({ stdout: stream, stderr: stream });
  const warn = console.warn;
  console.warn = capturedConsole.warn.bind(capturedConsole);
  const failure = new Error('private failure');
  try {
    await assert.rejects(
      observeProfileNavigation(page, origin, async () => {
        listener?.(response);
        throw failure;
      }),
      (error) => error === failure
    );
    const label = '[lettin-e2e] profile navigation diagnostics ';
    assert.ok(output.startsWith(label));
    const record = JSON.parse(output.slice(label.length));
    assert.equal(record.hops.length, 1);
    assert.deepEqual(record.hops[0].proxy, {
      stage: 'canonical-locale',
      requestLocale: 'unprefixed',
      nextLocale: 'en',
      sameRequestPath: false,
    });
    assert.equal(record.hops[0].sameOrigin, true);
    assert.equal(record.truncated, false);
    assert.doesNotMatch(
      output,
      /\[Object\]|private|secret|00000000|127\.0\.0\.1/u
    );
  } finally {
    console.warn = warn;
    stream.end();
  }
});

for (const body of ['pending', 'finished', 'failed'] as const) {
  test(`navigation failure distinguishes ${body} document body from lifecycle events`, async () => {
    const events = new EventEmitter();
    const frame = {};
    const page = Object.assign(events, {
      mainFrame: () => frame,
    }) as unknown as Page;
    const response = {
      request: () => ({
        isNavigationRequest: () => true,
        redirectedTo: () => null,
      }),
      frame: () => frame,
      status: () => 200,
      url: () =>
        `${origin}/00000000-0000-0000-0000-000000000000/profile?token=private`,
      finished: () =>
        body === 'pending'
          ? new Promise<null>(() => {})
          : body === 'failed'
            ? Promise.reject(new Error('private body failure'))
            : Promise.resolve(null),
    } as unknown as Response;
    const failure = new Error('private navigation failure');
    let captured: unknown;
    const warn = console.warn;
    console.warn = (_label, record) => {
      captured = JSON.parse(record);
    };
    try {
      await assert.rejects(
        observeProfileNavigation(page, origin, async () => {
          events.emit('response', response);
          events.emit('domcontentloaded');
          await Promise.resolve();
          throw failure;
        }),
        (error) => error === failure
      );
      assert.deepEqual(captured, {
        lifecycle: { domContentLoaded: true, load: false },
        hops: [
          {
            route: 'profile',
            locale: 'unprefixed',
            targetRoute: 'unavailable',
            targetLocale: 'unavailable',
            samePath: null,
            sameOrigin: null,
            status: 200,
            body,
          },
        ],
        truncated: false,
      });
      assert.doesNotMatch(
        JSON.stringify(captured),
        /private|secret|00000000|127\.0\.0\.1/u
      );
      assert.equal(events.eventNames().length, 0);
    } finally {
      console.warn = warn;
    }
  });
}

test('successful navigation detaches every observer without waiting for body completion', async () => {
  const events = new EventEmitter();
  const page = events as unknown as Page;
  const result = await observeProfileNavigation(page, origin, async () => {
    events.emit('domcontentloaded');
    events.emit('load');
    return 'completed';
  });
  assert.equal(result, 'completed');
  assert.equal(events.eventNames().length, 0);
});
