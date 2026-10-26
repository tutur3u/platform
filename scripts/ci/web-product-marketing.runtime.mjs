import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const next = fileURLToPath(
  new URL('../../apps/web/node_modules/next/dist/bin/next', import.meta.url)
);
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address();
assert.ok(address && typeof address !== 'string');
const port = address.port;
await new Promise((resolve, reject) =>
  listener.close((error) => (error ? reject(error) : resolve()))
);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [next, 'start', '-H', '127.0.0.1', '-p', String(port)],
  {
    cwd: web,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk).slice(-24000);
  });
}
const closed = once(child, 'close');
child.on('error', () => {});
let stage = 'startup';
try {
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Next exited before ready: ${output}`);
    try {
      const response = await fetch(`${origin}/meet`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      });
      await response.arrayBuffer();
      if (response.status === 307) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, `Next did not become ready: ${output}`);
  for (const [source, target] of [
    ['/meet', '/products/meet'],
    ['/vi/meet', '/vi/products/meet'],
    ['/meet/plans/one', '/products/meet/plans/one'],
    ['/vi/meet/plans/one', '/vi/products/meet/plans/one'],
    ['/calendar', '/products/calendar'],
    ['/vi/calendar', '/vi/products/calendar'],
    ['/ai', '/products/ai'],
    ['/vi/ai', '/vi/products/ai'],
  ]) {
    stage = source;
    const response = await fetch(
      `${origin}${source}?tag=one%2Ftwo&tag=three+four&empty=`,
      {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      }
    );
    await response.arrayBuffer();
    assert.equal(response.status, 307, source);
    const location = response.headers.get('location');
    assert.ok(location, source);
    const destination = new URL(location, origin);
    assert.equal(destination.origin, origin, source);
    assert.equal(destination.pathname, target, source);
    assert.deepEqual(
      destination.searchParams.getAll('tag'),
      ['one/two', 'three four'],
      source
    );
    assert.equal(destination.searchParams.get('empty'), '', source);
    console.log(
      `PASS 307 ${source} -> ${target}, including repeated query values`
    );
  }
} catch (error) {
  console.error('Web marketing runtime failure', {
    stage,
    serverOutput: output,
  });
  throw error;
} finally {
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGTERM');
  const settled = await Promise.race([
    closed.then(() => true),
    delay(10000, false, { ref: false }),
  ]);
  if (!settled) {
    child.kill('SIGKILL');
    await closed;
    console.error('Next required SIGKILL to stop');
    process.exitCode = 1;
  }
}
