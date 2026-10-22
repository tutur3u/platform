import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { withNativeBrowserFence } from './native-browser-fence.mjs';

const origin = 'http://127.0.0.1:4001';
const destination = 'http://127.0.0.1:4002';
const paused = (requestId, url) => ({ requestId, request: { url } });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(overrides = {}) {
  const calls = [];
  const session = new EventEmitter();
  session.send = async (method, params) => {
    calls.push([method, params]);
    if (method === 'Fetch.enable') {
      assert.equal(session.listenerCount('Fetch.requestPaused'), 1);
      assert.equal(session.listenerCount('close'), 1);
    }
    await overrides.send?.(method, params);
  };
  session.detach = async () => {
    calls.push(['detach']);
    await overrides.detach?.();
    session.emit('close');
  };
  let targetClosed = false;
  const context = new EventEmitter();
  const browser = new EventEmitter();
  const confirmClosure = (closeSession = true) => {
    targetClosed = true;
    context.emit('close');
    if (closeSession) session.emit('close');
  };
  context.newCDPSession = async (target) => {
    assert.equal(target, page);
    if (overrides.sessionFailure) throw overrides.sessionFailure;
    return session;
  };
  context.close = async () => {
    calls.push(['context.close']);
    await overrides.contextClose?.();
    confirmClosure();
  };
  const page = {
    context: () => context,
    isClosed: () => targetClosed,
    setDefaultTimeout: (timeout) => assert.equal(timeout, 10000),
    close: async () => {
      calls.push(['page.close']);
      await overrides.close?.();
      confirmClosure(!overrides.leaveSessionOpen);
    },
  };
  browser.newPage = async (options) => {
    assert.deepEqual(options, { serviceWorkers: 'block' });
    return page;
  };
  browser.close = async () => {
    calls.push(['browser.close']);
    await overrides.browserClose?.();
    confirmClosure();
    browser.emit('disconnected');
  };
  return { browser, page, session, context, calls, confirmClosure };
}

async function expectFailure(f, run, expected, options) {
  await assert.rejects(
    withNativeBrowserFence(f.browser, origin, [destination], run, options),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.ok(error.errors.some((item) => item.message === expected));
      assert.ok(
        error.errors.every(
          (item) => !item.message.includes('PRIVATE HEADER AND URL')
        )
      );
      assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
      assert.equal(f.session.listenerCount('close'), 0);
      return true;
    }
  );
}

test('each hop independently continues, fulfills or blocks without overrides', async () => {
  const f = fixture();
  const result = await withNativeBrowserFence(
    f.browser,
    origin,
    [destination],
    async (page) => {
      assert.equal(page, f.page);
      f.session.emit('Fetch.requestPaused', paused('initial', `${origin}/`));
      f.session.emit('Fetch.requestPaused', paused('middle', `${origin}/hop`));
      f.session.emit('Fetch.requestPaused', {
        ...paused('redirect', `${destination}/final`),
        redirectedRequestId: 'middle',
      });
      f.session.emit(
        'Fetch.requestPaused',
        paused('unknown', 'https://denied.invalid/private')
      );
      f.session.emit('Fetch.requestPaused', paused('invalid', 'not a URL'));
      await tick();
      return 'loaded';
    }
  );
  assert.deepEqual(f.calls[0], [
    'Fetch.enable',
    {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    },
  ]);
  assert.deepEqual(f.calls.slice(1, 3), [
    ['Fetch.continueRequest', { requestId: 'initial' }],
    ['Fetch.continueRequest', { requestId: 'middle' }],
  ]);
  const fulfillment = f.calls[3];
  assert.equal(fulfillment[0], 'Fetch.fulfillRequest');
  assert.equal(fulfillment[1].responseCode, 200);
  assert.deepEqual(fulfillment[1].responseHeaders, [
    { name: 'Content-Type', value: 'text/html' },
  ]);
  assert.match(
    Buffer.from(fulfillment[1].body, 'base64').toString(),
    /Disposable destination fixture/
  );
  assert.deepEqual(f.calls.slice(4, 6), [
    [
      'Fetch.failRequest',
      { requestId: 'unknown', errorReason: 'BlockedByClient' },
    ],
    [
      'Fetch.failRequest',
      { requestId: 'invalid', errorReason: 'BlockedByClient' },
    ],
  ]);
  assert.deepEqual(result, {
    value: 'loaded',
    counts: { continued: 2, fulfilled: 1, blocked: 2, excess: 0 },
  });
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
  assert.ok(!f.calls.some(([method]) => method === 'Fetch.disable'));
});

for (const [kind, url] of [
  ['continue', `${origin}/`],
  ['fulfill', `${destination}/`],
  ['block', 'https://denied.invalid/'],
]) {
  test(`${kind} protocol failure propagates without sensitive protocol diagnostics`, async () => {
    const f = fixture({
      send: async (method) => {
        if (method !== 'Fetch.enable')
          throw new Error('PRIVATE HEADER AND URL');
      },
    });
    await expectFailure(
      f,
      async () => {
        f.session.emit('Fetch.requestPaused', paused('one', url));
        await tick();
      },
      `Browser fence ${kind} failed`
    );
  });
}

test('enable failure and session creation failure both close the owned page', async () => {
  for (const sessionFailure of [undefined, new Error('session unavailable')]) {
    const f = fixture({
      sessionFailure,
      send: async () => {
        throw new Error('enable transport failed');
      },
    });
    await expectFailure(
      f,
      () => assert.fail('navigation must not run'),
      sessionFailure ? 'session unavailable' : 'Browser fence enable failed'
    );
    assert.ok(f.calls.some(([method]) => method === 'page.close'));
  }
});

test('primary survives handler and all owner closure failures; live fence is retained', async () => {
  const primary = new Error('navigation primary');
  const f = fixture({
    close: async () => {
      throw new Error('page internals');
    },
    contextClose: async () => {
      throw new Error('context internals');
    },
    browserClose: async () => {
      throw new Error('browser internals');
    },
    send: async (method) => {
      if (method !== 'Fetch.enable') throw new Error('send internals');
    },
  });
  await assert.rejects(
    withNativeBrowserFence(f.browser, origin, [destination], async () => {
      f.session.emit('Fetch.requestPaused', paused('one', `${origin}/`));
      throw primary;
    }),
    (error) => {
      assert.equal(error.errors[0], primary);
      assert.deepEqual(
        error.errors.map((item) => item.message).sort(),
        [
          'navigation primary',
          'Browser fence continue failed',
          'Browser fence page close failed',
          'Browser fence context close failed',
          'Browser fence browser close failed',
          'Browser fence target closure unconfirmed; handlers retained',
        ].sort()
      );
      return true;
    }
  );
  assert.equal(
    f.calls.some(([method]) => method === 'detach'),
    false
  );
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
  f.confirmClosure();
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
  assert.equal(f.session.listenerCount('close'), 0);
});

test('keeps interception through page close and drains handlers before detach', async () => {
  let release;
  let settled = false;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    leaveSessionOpen: true,
    send: async (method) => {
      if (method === 'Fetch.continueRequest') {
        await pending;
        settled = true;
      }
    },
    close: async () => {
      assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
      release();
    },
    detach: async () => {
      assert.equal(settled, true);
    },
  });
  await withNativeBrowserFence(f.browser, origin, [destination], async () => {
    f.session.emit('Fetch.requestPaused', paused('one', `${origin}/`));
  });
  assert.equal(settled, true);
  assert.ok(
    f.calls.findIndex(([method]) => method === 'page.close') <
      f.calls.findIndex(([method]) => method === 'detach')
  );
});

test('unexpected session closure is fatal, expected target closure needs no detach', async () => {
  const f = fixture();
  await expectFailure(
    f,
    async () => {
      f.session.emit('close');
      await tick();
    },
    'Browser fence session closed during navigation'
  );
  assert.ok(!f.calls.some(([method]) => method === 'detach'));
});

test('cap blocks excess requests and diagnostics remain bounded', async () => {
  const f = fixture();
  await expectFailure(
    f,
    async (_page, counts) => {
      for (let i = 0; i < 5; i++)
        f.session.emit('Fetch.requestPaused', paused(String(i), `${origin}/`));
      await tick();
      assert.deepEqual(counts, {
        continued: 1,
        fulfilled: 0,
        blocked: 0,
        excess: 1,
      });
    },
    'Browser fence request cap exceeded',
    { maxRequests: 1 }
  );
  assert.equal(
    f.calls.filter(([method]) => method === 'Fetch.continueRequest').length,
    1
  );
  assert.equal(
    f.calls.filter(([method]) => method === 'Fetch.failRequest').length,
    4
  );
});

test('invalid cap/origin admission opens no page', async () => {
  const browser = {
    newPage: () => assert.fail('must reject before allocation'),
  };
  for (const maxRequests of [0, -1, 4097, Infinity, 1.5])
    await assert.rejects(
      withNativeBrowserFence(browser, origin, [], () => {}, { maxRequests })
    );
  for (const cleanupTimeoutMs of [0, -1, 10001, Infinity, 1.5])
    await assert.rejects(
      withNativeBrowserFence(browser, origin, [], () => {}, {
        cleanupTimeoutMs,
      })
    );
  await assert.rejects(
    withNativeBrowserFence(browser, `${origin}/path`, [], () => {})
  );
  await assert.rejects(
    withNativeBrowserFence(browser, origin, [origin], () => {})
  );
});

test('detach rejection after observed session closure is not a cleanup failure', async () => {
  const f = fixture({
    leaveSessionOpen: true,
    detach: async () => {
      f.session.emit('close');
      throw new Error('target already closed');
    },
  });
  await withNativeBrowserFence(
    f.browser,
    origin,
    [destination],
    async () => {}
  );
  assert.equal(f.session.listenerCount('close'), 0);
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
});

test('late handler failure during page shutdown still fails acceptance', async () => {
  const f = fixture({
    close: async () => {
      f.session.emit('Fetch.requestPaused', paused('late', `${origin}/`));
    },
    send: async (method) => {
      if (method === 'Fetch.continueRequest') {
        await tick();
        throw new Error('late transport failure');
      }
    },
  });
  await expectFailure(f, async () => 'loaded', 'Browser fence continue failed');
});

test('page-close rejection keeps interception until pending navigation target closes and handlers drain', {
  timeout: 2000,
}, async () => {
  let rejectNavigation;
  let beginContextClose;
  let finishContextClose;
  let finishHandler;
  let settled = false;
  const primary = new Error('navigation interrupted at confirmed closure');
  const navigation = new Promise((_, reject) => {
    rejectNavigation = reject;
  });
  const contextStarted = new Promise((resolve) => {
    beginContextClose = resolve;
  });
  const contextGate = new Promise((resolve) => {
    finishContextClose = resolve;
  });
  const handlerGate = new Promise((resolve) => {
    finishHandler = resolve;
  });
  const f = fixture({
    close: async () => {
      throw new Error('page close rejected with live target');
    },
    contextClose: async () => {
      beginContextClose();
      await contextGate;
      rejectNavigation(primary);
    },
    // On the old implementation this succeeds and releases a still-live fence.
    detach: async () => {
      rejectNavigation(primary);
    },
    send: async (method) => {
      if (method === 'Fetch.continueRequest') throw new Error('start cleanup');
      if (method === 'Fetch.failRequest') await handlerGate;
    },
  });
  const outcome = withNativeBrowserFence(
    f.browser,
    origin,
    [destination],
    async () => {
      f.session.emit('Fetch.requestPaused', paused('initial', `${origin}/`));
      return navigation;
    },
    { cleanupTimeoutMs: 1000 }
  );
  void outcome.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  try {
    await Promise.race([
      contextStarted,
      outcome.then(
        () => assert.fail('returned before owned closure'),
        () => assert.fail('returned before owned closure')
      ),
    ]);
    assert.equal(f.page.isClosed(), false);
    assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
    assert.equal(
      f.calls.some(([method]) => method === 'detach'),
      false
    );
    f.session.emit(
      'Fetch.requestPaused',
      paused('during-cleanup', 'https://denied.invalid/')
    );
    await tick();
    assert.ok(
      f.calls.some(
        ([method, params]) =>
          method === 'Fetch.failRequest' &&
          params.requestId === 'during-cleanup' &&
          params.errorReason === 'BlockedByClient'
      )
    );
    finishContextClose();
    await tick();
    assert.equal(f.page.isClosed(), true);
    assert.equal(
      settled,
      false,
      'Confirmed closure alone cannot skip handler drain'
    );
    assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
    finishHandler();
    await assert.rejects(outcome, (error) => {
      assert.equal(error.errors[0], primary);
      assert.ok(
        error.errors.some(
          (item) => item.message === 'Browser fence page close failed'
        )
      );
      return true;
    });
    assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
    assert.equal(
      f.calls.some(([method]) => method === 'detach'),
      false
    );
  } finally {
    finishContextClose();
    finishHandler();
    rejectNavigation(primary);
    await outcome.catch(() => {});
  }
});

test('page and context close rejection fall back to owned browser before release', async () => {
  const f = fixture({
    close: async () => {
      throw new Error('page close rejected');
    },
    contextClose: async () => {
      throw new Error('context close rejected');
    },
    browserClose: async () => {
      assert.equal(f.page.isClosed(), false);
      assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
      assert.equal(
        f.calls.some(([method]) => method === 'detach'),
        false
      );
    },
  });
  await expectFailure(
    f,
    async () => 'loaded',
    'Browser fence context close failed'
  );
  assert.deepEqual(
    f.calls
      .filter(([method]) => method.endsWith('.close'))
      .map(([method]) => method),
    ['page.close', 'context.close', 'browser.close']
  );
  assert.equal(f.page.isClosed(), true);
});

test('unsettled closure and navigation return a bounded failure while retaining interception', {
  timeout: 1000,
}, async () => {
  let rejectNavigation;
  const navigation = new Promise((_, reject) => {
    rejectNavigation = reject;
  });
  const never = () => new Promise(() => {});
  const f = fixture({
    close: never,
    contextClose: never,
    browserClose: never,
    send: async (method) => {
      if (method === 'Fetch.continueRequest') throw new Error('start cleanup');
    },
  });
  try {
    await assert.rejects(
      withNativeBrowserFence(
        f.browser,
        origin,
        [],
        async () => {
          f.session.emit('Fetch.requestPaused', paused('one', `${origin}/`));
          return navigation;
        },
        { cleanupTimeoutMs: 30 }
      ),
      (error) => {
        const messages = error.errors.map((item) => item.message);
        for (const category of [
          'page close failed',
          'context close failed',
          'browser close failed',
          'navigation settlement failed',
        ])
          assert.ok(
            messages.includes(`Browser fence ${category} deadline exceeded`)
          );
        assert.ok(
          messages.includes(
            'Browser fence target closure unconfirmed; handlers retained'
          )
        );
        return true;
      }
    );
    assert.equal(f.page.isClosed(), false);
    assert.equal(
      f.calls.some(([method]) => method === 'detach'),
      false
    );
    assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
  } finally {
    f.confirmClosure();
    rejectNavigation(new Error('late navigation closure'));
  }
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
});

test('confirmed target closure retains primary when session detach fails', async () => {
  const primary = new Error('navigation primary');
  const f = fixture({
    leaveSessionOpen: true,
    detach: async () => {
      throw new Error('detach internals');
    },
  });
  await assert.rejects(
    withNativeBrowserFence(f.browser, origin, [], async () => {
      throw primary;
    }),
    (error) => {
      assert.equal(error.errors[0], primary);
      assert.ok(
        error.errors.some(
          (item) => item.message === 'Browser fence session detach failed'
        )
      );
      return true;
    }
  );
  assert.equal(f.page.isClosed(), true);
  f.session.emit('close');
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
});

test('handler drain deadline retains listeners until late handler settlement', {
  timeout: 1000,
}, async () => {
  let finishHandler;
  const handler = new Promise((resolve) => {
    finishHandler = resolve;
  });
  const f = fixture({
    send: async (method) => {
      if (method === 'Fetch.continueRequest') await handler;
    },
  });
  try {
    await assert.rejects(
      withNativeBrowserFence(
        f.browser,
        origin,
        [],
        async () => {
          f.session.emit('Fetch.requestPaused', paused('one', `${origin}/`));
        },
        { cleanupTimeoutMs: 30 }
      ),
      (error) => {
        assert.ok(
          error.errors.some(
            (item) =>
              item.message ===
              'Browser fence handler drain failed deadline exceeded'
          )
        );
        return true;
      }
    );
    assert.equal(f.page.isClosed(), true);
    assert.equal(f.session.listenerCount('Fetch.requestPaused'), 1);
    assert.equal(
      f.calls.some(([method]) => method === 'detach'),
      false
    );
  } finally {
    finishHandler();
    await tick();
  }
  assert.equal(f.session.listenerCount('Fetch.requestPaused'), 0);
});
