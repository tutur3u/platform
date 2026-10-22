import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import { withNativeBrowserFence } from '../../apps/apps/cloudflare/native-browser-fence.mjs';

const browserRequire = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);
const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === '--chrome'),
  'Only --chrome is admitted'
);
const html =
  '<title>Loopback destination</title><link rel="icon" href="data:,">';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

// Frozen negative control: the same two page.route layers as the old caller.
async function oldRouteControl(page, origin, destination, counts) {
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    counts.blocked++;
    return route.abort('blockedbyclient');
  });
  await page.route(
    (url) => url.origin === destination,
    (route) => {
      counts.fulfilled++;
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: html,
      });
    }
  );
}

async function clickThrough(page, origin, destination, blocked = false) {
  page.setDefaultTimeout(10000);
  assert.equal((await page.goto(origin)).status(), 200);
  const response = page.waitForResponse(
    (value) => value.url() === `${origin}/launch` && value.status() === 307
  );
  const intermediate = page.waitForResponse(
    (value) =>
      value.url() === `${origin}/intermediate` && value.status() === 307
  );
  const failure = blocked
    ? page.waitForEvent('requestfailed', {
        predicate: (request) => request.url() === `${destination}/destination`,
      })
    : undefined;
  // Observe both promises even if the click fails.
  const observations = Promise.all([response, intermediate, failure]);
  void observations.catch(() => {});
  await page.locator('a').click({ noWaitAfter: true });
  const [redirect, hop, denied] = await observations;
  assert.equal(redirect.headers().location, `${origin}/intermediate`);
  assert.equal(hop.headers().location, `${destination}/destination`);
  if (blocked) {
    assert.ok(denied.failure()?.errorText.includes('ERR_BLOCKED_BY_CLIENT'));
  } else {
    await page.waitForURL((url) => url.href === `${destination}/destination`, {
      waitUntil: 'load',
    });
    assert.equal(page.url(), `${destination}/destination`);
    assert.match(await page.title(), /destination/i);
  }
}

test('loopback redirect RED bypass, CDP GREEN fulfillment and denied hop', {
  timeout: 60000,
}, async () => {
  let upstream = 0;
  let intermediate = 0;
  let destination;
  let origin;
  let browser;
  let primary;
  const errors = [];
  const b = createServer((_request, response) => {
    upstream++;
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  });
  const a = createServer((request, response) => {
    if (request.url === '/launch') {
      response.writeHead(307, { Location: `${origin}/intermediate` }).end();
    } else if (request.url === '/intermediate') {
      intermediate++;
      response.writeHead(307, { Location: `${destination}/destination` }).end();
    } else if (request.url === '/') {
      response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          '<link rel="icon" href="data:,"><a href="/launch">Open disposable destination</a>'
        );
    } else {
      response.writeHead(404).end();
    }
  });
  try {
    destination = await listen(b);
    origin = await listen(a);
    const { chromium } = browserRequire('playwright');
    browser = await chromium.launch({
      headless: true,
      ...(args.includes('--chrome') ? { channel: 'chrome' } : {}),
    });
    const page = await browser.newPage({ serviceWorkers: 'block' });
    let redPrimary;
    const red = { fulfilled: 0, blocked: 0 };
    try {
      await oldRouteControl(page, origin, destination, red);
      await clickThrough(page, origin, destination);
      assert.equal(
        red.fulfilled,
        0,
        'RED must demonstrate the real redirect bypass'
      );
      assert.equal(upstream, 1, 'RED must reach the disposable B listener');
      assert.equal(intermediate, 1);
    } catch (error) {
      redPrimary = error;
    } finally {
      try {
        await page.close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (redPrimary) throw redPrimary;
    upstream = 0;
    intermediate = 0;
    const green = await withNativeBrowserFence(
      browser,
      origin,
      [destination],
      (ownedPage) => clickThrough(ownedPage, origin, destination)
    );
    assert.equal(green.counts.fulfilled, 1);
    assert.equal(
      green.counts.continued,
      3,
      'Catalogue and both A redirect hops classify independently'
    );
    assert.equal(green.counts.blocked, 0);
    assert.equal(green.counts.excess, 0);
    assert.equal(upstream, 0, 'GREEN must never reach B upstream');
    assert.equal(intermediate, 1);
    intermediate = 0;
    const denied = await withNativeBrowserFence(
      browser,
      origin,
      [],
      (ownedPage) => clickThrough(ownedPage, origin, destination, true)
    );
    assert.equal(denied.counts.fulfilled, 0);
    assert.equal(denied.counts.blocked, 1);
    assert.equal(denied.counts.continued, 3);
    assert.equal(denied.counts.excess, 0);
    assert.equal(upstream, 0, 'Unadmitted B must not reach upstream');
    assert.equal(intermediate, 1);
  } catch (error) {
    primary = error;
  } finally {
    for (const close of [
      () => browser?.close(),
      () => closeServer(a),
      () => closeServer(b),
    ]) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (primary || errors.length)
    throw new AggregateError(
      [primary, ...errors].filter(Boolean),
      'Finite browser fence proof failed'
    );
});
