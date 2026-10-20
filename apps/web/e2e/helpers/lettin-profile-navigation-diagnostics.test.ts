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
    assert.deepEqual(
      JSON.parse(JSON.stringify(captured), (key, value) =>
        key === 'version' || key === 'loadObservation' ? undefined : value
      ),
      {
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
      }
    );
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
    assert.deepEqual(
      JSON.parse(JSON.stringify(captured), (key, value) =>
        key === 'version' || key === 'loadObservation' ? undefined : value
      ),
      {
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
      }
    );
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
      assert.deepEqual(
        JSON.parse(JSON.stringify(captured), (key, value) =>
          key === 'version' || key === 'loadObservation' ? undefined : value
        ),
        {
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
        }
      );
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

const observedEvents = [
  'request',
  'response',
  'requestfinished',
  'requestfailed',
  'frameattached',
  'framenavigated',
  'framedetached',
  'domcontentloaded',
  'load',
];
function observationFixture() {
  const page = new EventEmitter();
  const main = { url: () => origin, parentFrame: () => null };
  const child = {
    url: () => `${origin}/login?secret=private`,
    parentFrame: () => main,
  };
  const fake = Object.assign(page, {
    mainFrame: () => main,
    frames: () => [main, child],
  });
  const request = (frame = child, resource = 'stylesheet') => ({
    frame: () => frame,
    url: () => `${origin}/private?secret=private`,
    resourceType: () => resource,
    method: () => 'GET',
    isNavigationRequest: () => resource === 'document',
    failure: () => {
      throw new Error('failure text must not be read');
    },
  });
  return { page: fake as unknown as Page, emitter: page, main, child, request };
}
async function captureObservation(action: () => Promise<unknown>) {
  const output: string[] = [];
  const warn = console.warn;
  console.warn = (_label, value) => {
    output.push(value);
  };
  try {
    await action();
  } finally {
    console.warn = warn;
  }
  assert.equal(output.length, 1);
  assert.ok(Buffer.byteLength(output[0], 'utf8') <= 49152);
  return JSON.parse(output[0]);
}

test('listeners precede one callback; child and stylesheet states remain distinct for both lifecycle cases', async () => {
  for (const dcl of [false, true])
    for (const terminal of ['outstanding', 'finished', 'failed']) {
      const fixture = observationFixture();
      const failure = new Error('private failure');
      let calls = 0;
      const record = await captureObservation(() =>
        assert.rejects(
          observeProfileNavigation(fixture.page, origin, async () => {
            calls++;
            for (const event of observedEvents)
              assert.equal(fixture.emitter.listenerCount(event), 1);
            const doc = fixture.request(fixture.child, 'document');
            const css = fixture.request();
            fixture.emitter.emit('request', doc);
            fixture.emitter.emit('request', css);
            if (dcl) fixture.emitter.emit('domcontentloaded');
            if (terminal !== 'outstanding') {
              const event =
                terminal === 'finished' ? 'requestfinished' : 'requestfailed';
              fixture.emitter.emit(event, doc);
              fixture.emitter.emit(event, css);
            }
            throw failure;
          }),
          (error) => error === failure
        )
      );
      assert.equal(calls, 1);
      assert.deepEqual(record.lifecycle, {
        domContentLoaded: dcl,
        load: false,
      });
      assert.equal(record.loadObservation.coverage, 'unknown');
      assert.equal(
        record.loadObservation.requests[0].terminal,
        terminal === 'outstanding' ? 'outstanding-at-snapshot' : terminal
      );
      assert.equal(
        record.loadObservation.requests[1].terminal,
        terminal === 'outstanding' ? 'outstanding-at-snapshot' : terminal
      );
      assert.equal(record.loadObservation.requests[0].frame, 2);
      assert.equal(record.loadObservation.frames[1].parent, 1);
      assert.equal(record.loadObservation.frames[1].load, 'unknown');
      assert.doesNotMatch(
        JSON.stringify(record),
        /private|secret|failure text/u
      );
      for (const event of observedEvents)
        assert.equal(fixture.emitter.listenerCount(event), 0);
    }
});

test('late response completion and old handlers cannot mutate or leak into another invocation', async () => {
  const f = observationFixture();
  let finish: (value: Error | null) => void = () => {};
  const pending = new Promise<Error | null>((resolve) => {
    finish = resolve;
  });
  const old: ReturnType<EventEmitter['listeners']> = [];
  const first = await captureObservation(() =>
    assert.rejects(
      observeProfileNavigation(f.page, origin, async () => {
        for (const event of observedEvents)
          old.push(...f.emitter.listeners(event));
        f.emitter.emit('response', {
          request: () => ({
            isNavigationRequest: () => true,
            redirectedTo: () => null,
          }),
          frame: () => f.main,
          status: () => 200,
          url: () => origin,
          finished: () => pending,
        });
        throw new Error('first');
      })
    )
  );
  const before = JSON.stringify(first);
  finish(null);
  await Promise.resolve();
  const second = await captureObservation(() =>
    assert.rejects(
      observeProfileNavigation(f.page, origin, async () => {
        for (const listener of old) listener(f.request());
        throw new Error('second');
      })
    )
  );
  assert.equal(JSON.stringify(first), before);
  assert.equal(first.hops[0].body, 'pending');
  assert.deepEqual(second.loadObservation.requests, []);
  assert.deepEqual(second.hops, []);
});

test('caps retain first records, count omissions and keep unknown coverage', async () => {
  const f = observationFixture();
  const record = await captureObservation(() =>
    assert.rejects(
      observeProfileNavigation(f.page, origin, async () => {
        for (let i = 0; i < 100; i++) {
          f.emitter.emit('request', f.request());
          f.emitter.emit('frameattached', {
            url: () => origin,
            parentFrame: () => f.main,
          });
        }
        for (let i = 0; i < 200; i++)
          f.emitter.emit('requestfinished', f.request());
        f.emitter.emit('framedetached', f.child);
        f.emitter.emit('framenavigated', f.child);
        throw new Error('cap');
      })
    )
  );
  const o = record.loadObservation;
  assert.equal(o.requests.length, 64);
  assert.equal(o.frames.length, 16);
  assert.equal(o.events.length, 128);
  assert.equal(o.counts.droppedRequests, 36);
  assert.equal(o.counts.droppedFrames, 86);
  assert.equal(o.counts.orphan, 200);
  assert.ok(o.counts.droppedEvents > 0);
  assert.equal(o.requests[0].id, 1);
  assert.equal(o.coverage, 'unknown');
});

test('accessor, setup and writer errors preserve exact navigation outcome and cleanup', async () => {
  const f = observationFixture();
  const failure = {};
  const warn = console.warn;
  let calls = 0;
  console.warn = () => {
    throw new Error('writer');
  };
  try {
    await assert.rejects(
      observeProfileNavigation(f.page, origin, async () => {
        calls++;
        f.emitter.emit('request', {
          frame: () => {
            throw failure;
          },
        });
        throw failure;
      }),
      (error) => error === failure
    );
    assert.equal(calls, 1);
    for (const event of observedEvents)
      assert.equal(f.emitter.listenerCount(event), 0);
  } finally {
    console.warn = warn;
  }
});

test('partial setup and removal errors never prevent a callback or independent cleanup', async () => {
  const f = observationFixture();
  const failure = {};
  const add = f.emitter.on.bind(f.emitter);
  const remove = f.emitter.off.bind(f.emitter);
  let calls = 0;
  f.emitter.on = (name, callback) => {
    add(name, callback);
    if (name === 'response') throw failure;
    return f.emitter;
  };
  f.emitter.off = (name, callback) => {
    remove(name, callback);
    if (name === 'response') throw failure;
    return f.emitter;
  };
  const record = await captureObservation(() =>
    assert.rejects(
      observeProfileNavigation(f.page, origin, async () => {
        calls++;
        throw failure;
      }),
      (error) => error === failure
    )
  );
  assert.equal(calls, 1);
  assert.equal(record.loadObservation.counts.errors, 1);
  assert.equal(f.emitter.eventNames().length, 0);
});

test('invalid clocks, missing frame association and saturated counters stay unknown', async (t) => {
  t.mock.method(performance, 'now', () => Number.NaN);
  const f = observationFixture();
  const record = await captureObservation(() =>
    assert.rejects(
      observeProfileNavigation(f.page, origin, async () => {
        const request = {
          ...f.request(),
          frame: () => {
            throw new Error('private');
          },
        };
        f.emitter.emit('request', request);
        for (let i = 0; i < 65540; i++)
          f.emitter.emit('requestfinished', f.request());
        throw new Error('private');
      })
    )
  );
  const o = record.loadObservation;
  assert.equal(o.requests[0].frame, null);
  assert.equal(o.requests[0].start, null);
  assert.equal(o.counts.orphan, 65535);
  assert.equal(o.saturated, true);
  assert.ok(o.counts.timingErrors > 0);
  assert.ok(o.counts.errors > 0);
  assert.equal(o.coverage, 'unknown');
  assert.equal(o.events.length, 128);
});
