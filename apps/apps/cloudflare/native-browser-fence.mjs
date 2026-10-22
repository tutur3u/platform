const fixtureBody = Buffer.from(
  '<title>Disposable destination fixture</title><link rel="icon" href="data:,">'
).toString('base64');

// This owns one page target, not popups or out-of-process frames.
export async function withNativeBrowserFence(
  browser,
  origin,
  destinations,
  run,
  { maxRequests = 4096, cleanupTimeoutMs = 10000 } = {}
) {
  if (
    !Number.isSafeInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > 4096
  )
    throw new Error('Invalid browser fence request cap');
  if (
    !Number.isSafeInteger(cleanupTimeoutMs) ||
    cleanupTimeoutMs < 1 ||
    cleanupTimeoutMs > 10000
  )
    throw new Error('Invalid browser fence cleanup deadline');
  if (new URL(origin).origin !== origin)
    throw new Error('Invalid browser fence listener origin');
  const admitted = new Set(destinations);
  for (const value of admitted) {
    if (new URL(value).origin !== value || value === origin)
      throw new Error('Invalid browser fence destination origin');
  }
  const counts = { continued: 0, fulfilled: 0, blocked: 0, excess: 0 };
  const pending = new Set();
  const failures = new Map();
  let page;
  let context;
  let contextClosed = false;
  let browserClosed = false;
  let cleanupDeadline;
  let session;
  let sessionClosed = false;
  let closing = false;
  let operation;
  let operationPrimary;
  let primary;
  let value;
  let rejectFatal;
  const fatal = new Promise((_, reject) => {
    rejectFatal = reject;
  });
  // Setup can fail before the navigation races this promise.
  void fatal.catch(() => {});
  const fail = (category) => {
    if (!failures.has(category))
      failures.set(category, new Error(`Browser fence ${category}`));
    rejectFatal(failures.get(category));
  };
  const closureConfirmed = () =>
    !page || page.isClosed() || contextClosed || browserClosed;
  const releaseWhenSafe = () => {
    if (!closing || !closureConfirmed() || pending.size || !sessionClosed)
      return;
    session.removeListener('Fetch.requestPaused', onPaused);
    session.removeListener('close', onClose);
    context.removeListener('close', onContextClose);
    browser.removeListener('disconnected', onBrowserClose);
  };
  const onContextClose = () => {
    contextClosed = true;
    releaseWhenSafe();
  };
  const onBrowserClose = () => {
    browserClosed = true;
    releaseWhenSafe();
  };
  const onClose = () => {
    sessionClosed = true;
    if (!closing) fail('session closed during navigation');
    releaseWhenSafe();
  };
  const handle = async (event) => {
    const total = counts.continued + counts.fulfilled + counts.blocked;
    let category;
    let method;
    let params = { requestId: event.requestId };
    let requestOrigin;
    try {
      requestOrigin = new URL(event.request.url).origin;
    } catch {
      requestOrigin = null;
    }
    if (total >= maxRequests) {
      counts.excess = 1;
      category = 'request cap exceeded';
      fail(category);
      method = 'Fetch.failRequest';
      params.errorReason = 'BlockedByClient';
    } else if (requestOrigin === origin) {
      counts.continued++;
      category = 'continue failed';
      method = 'Fetch.continueRequest';
    } else if (admitted.has(requestOrigin)) {
      counts.fulfilled++;
      category = 'fulfill failed';
      method = 'Fetch.fulfillRequest';
      params = {
        ...params,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
        body: fixtureBody,
      };
    } else {
      counts.blocked++;
      category = 'block failed';
      method = 'Fetch.failRequest';
      params.errorReason = 'BlockedByClient';
    }
    try {
      await session.send(method, params);
    } catch {
      fail(category);
    } finally {
      if (counts.excess) fail('request cap exceeded');
    }
  };
  const onPaused = (event) => {
    const task = Promise.resolve()
      .then(() => handle(event))
      .catch(() => fail('handler failed'));
    pending.add(task);
    void task.then(() => {
      pending.delete(task);
      releaseWhenSafe();
    });
  };
  const drain = async () => {
    while (pending.size) await Promise.all([...pending]);
  };
  const remaining = () => Math.max(0, cleanupDeadline - performance.now());
  const boundedCleanup = async (start, category, budget = remaining()) => {
    let timer;
    const task = Promise.resolve()
      .then(start)
      .then(
        () => true,
        () => {
          fail(category);
          return false;
        }
      );
    try {
      return await Promise.race([
        task,
        new Promise((resolve) => {
          timer = setTimeout(() => {
            fail(`${category} deadline exceeded`);
            resolve(false);
          }, budget);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    // browser.newPage creates a context owned exclusively by this page.
    page = await browser.newPage({ serviceWorkers: 'block' });
    context = page.context();
    context.on('close', onContextClose);
    browser.on('disconnected', onBrowserClose);
    page.setDefaultTimeout(10000);
    session = await context.newCDPSession(page);
    session.on('close', onClose);
    session.on('Fetch.requestPaused', onPaused);
    try {
      await session.send('Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      });
    } catch {
      throw new Error('Browser fence enable failed');
    }
    operation = Promise.resolve().then(() => run(page, counts));
    void operation.catch((error) => {
      operationPrimary = error;
    });
    value = await Promise.race([operation, fatal]);
  } catch (error) {
    primary = error;
  } finally {
    closing = true;
    cleanupDeadline = performance.now() + cleanupTimeoutMs;
    if (page) {
      // A rejected or timed-out close is not evidence that interception can stop.
      await boundedCleanup(
        () => page.close(),
        'page close failed',
        remaining() / 3
      );
      if (!closureConfirmed()) {
        await boundedCleanup(
          () => context.close(),
          'context close failed',
          remaining() / 2
        );
      }
      if (!closureConfirmed()) {
        await boundedCleanup(
          () => browser.close(),
          'browser close failed',
          remaining()
        );
      }
    }
    if (!closureConfirmed())
      fail('target closure unconfirmed; handlers retained');
    const drained = await boundedCleanup(drain, 'handler drain failed');
    if (session && closureConfirmed() && drained) {
      if (!sessionClosed) {
        await boundedCleanup(async () => {
          try {
            await session.detach();
            sessionClosed = true;
            releaseWhenSafe();
          } catch {
            if (!sessionClosed) throw new Error('Session detach failed');
          }
        }, 'session detach failed');
      }
      releaseWhenSafe();
    }
    if (operation) {
      await boundedCleanup(
        () => operation.catch(() => {}),
        'navigation settlement failed'
      );
    }
    // On an unconfirmed closure or drain timeout, keep listeners and Fetch owned.
    // Late confirmed closure plus session closure/drain can release them safely.
    if (!session) {
      context?.removeListener('close', onContextClose);
      browser.removeListener('disconnected', onBrowserClose);
    }
  }

  const errors = [
    ...new Set(
      [operationPrimary ?? primary, primary, ...failures.values()].filter(
        Boolean
      )
    ),
  ];
  if (errors.length) throw new AggregateError(errors, 'Browser fence failed');
  return { value, counts };
}
