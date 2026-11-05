import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { parseArgs, runSwitch, runTtfb, summarize } from './app-switch-lab.mjs';

test('parses switch and ttfb arguments and rejects bad input', () => {
  assert.deepEqual(
    parseArgs([
      'switch',
      '--from',
      'https://a.test/',
      '--link',
      'a',
      '--runs',
      '3',
      '--throttle',
      'slow4g',
      '--warm',
    ]),
    {
      mode: 'switch',
      from: 'https://a.test/',
      link: 'a',
      runs: 3,
      throttle: 'slow4g',
      warm: true,
    }
  );
  assert.deepEqual(
    parseArgs(['ttfb', '--urls', 'https://a.test/,https://b.test/']).urls,
    ['https://a.test/', 'https://b.test/']
  );
  for (const argv of [
    ['other'],
    ['switch', '--from', 'https://a.test/'],
    ['ttfb'],
    ['ttfb', '--urls', 'x', '--runs', '0'],
    ['ttfb', '--urls', 'x', '--throttle', 'fast'],
    ['ttfb', '--urls'],
    ['ttfb', '--urls', 'x', '--bogus', '1'],
  ])
    assert.throws(() => parseArgs(argv));
});

test('summarizes with nearest-rank percentiles', () => {
  const samples = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.deepEqual(summarize(samples), {
    n: 20,
    p50: 10,
    p75: 15,
    p95: 19,
    min: 1,
    max: 20,
  });
  assert.equal(summarize([]).p50, null);
});

test('times every ttfb run and never echoes the storage-state path', async () => {
  let calls = 0;
  const report = await runTtfb(
    {
      mode: 'ttfb',
      urls: ['https://a.test/'],
      runs: 3,
      throttle: 'none',
      storageState: '/secret/state.json',
    },
    async () => {
      calls++;
      return new Response('ok');
    }
  );
  assert.equal(calls, 3);
  assert.equal(report.results['https://a.test/'].n, 3);
  assert.equal(report.options.signedIn, true);
  assert.equal(JSON.stringify(report).includes('/secret/'), false);
});

test('times a click to the destination app-ready mark', async (t) => {
  let chromium;
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(
      new URL('../../apps/web/package.json', import.meta.url)
    );
    chromium = require('@playwright/test').chromium;
    await (await chromium.launch()).close();
  } catch {
    t.skip('Playwright Chromium is not installed on this host');
    return;
  }
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(
      request.url === '/meet'
        ? '<script>setTimeout(()=>performance.mark("ttr:app-ready"),50)</script>'
        : '<a id="go" href="/meet">Meet</a>'
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const report = await runSwitch(
      {
        mode: 'switch',
        from: `http://127.0.0.1:${port}/`,
        link: '#go',
        runs: 2,
        throttle: 'none',
        warm: false,
      },
      chromium
    );
    assert.equal(report.summary.n, 2);
    assert.ok(report.runs.every((run) => run.readyBy === 'mark'));
    assert.ok(report.summary.min >= 40);
  } finally {
    server.close();
  }
});
