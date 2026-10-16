import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { runtimeDeadline } from './runtime-deadline.mjs';

for (const stall of ['headers', 'body']) {
  test(`shared deadline cancels stalled HTTP ${stall}`, {
    timeout: 2_000,
  }, async (t) => {
    const timers = new Set();
    const server = createServer((_request, response) => {
      if (stall === 'body') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.write('partial');
      }
      // Finite RED recovery: even the uncancelled baseline eventually completes.
      timers.add(setTimeout(() => response.end('late'), 180));
    });
    t.after(async () => {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const runtime = runtimeDeadline(t.signal, 40);
    const started = performance.now();
    await assert.rejects(
      async () => {
        const response = await runtime.fetch(
          `http://127.0.0.1:${server.address().port}`
        );
        await runtime.text(response);
      },
      (error) => error.name === 'TimeoutError' || error.name === 'AbortError'
    );
    assert.ok(
      performance.now() - started < 160,
      'Probe cancels before fixture release'
    );
  });
}

test('test cancellation stops startup wait and rejects subsequent probes', {
  timeout: 2_000,
}, async () => {
  const cancellation = new AbortController();
  const runtime = runtimeDeadline(cancellation.signal, 1_000);
  const timer = setTimeout(() => cancellation.abort(), 20);
  try {
    await assert.rejects(runtime.wait(180), { name: 'AbortError' });
    assert.throws(() => runtime.check(), { name: 'AbortError' });
    await assert.rejects(runtime.fetch('http://127.0.0.1:1'), {
      name: 'AbortError',
    });
  } finally {
    clearTimeout(timer);
  }
});
