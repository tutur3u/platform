import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';
import { failureSummary } from './diagnostic.mjs';

const sha = process.env.GITHUB_SHA;
assert.match(
  sha ?? '',
  /^[a-f0-9]{40}$/,
  'CI must supply the full artifact source SHA'
);

test('CI-built Parley completes sequential and concurrent bilingual pages', {
  timeout: 180_000,
}, async () => {
  const harness = createTestHarness({
    workers: [
      {
        configPath: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)),
      },
    ],
  });
  const receipts = [];
  /** Require bounded, complete rendered HTML rather than accepting status alone. */
  async function probe(path, title) {
    const response = await harness.fetch(path, {
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(
      response.status,
      200,
      response.status === 200
        ? path
        : `${path}: ${await failureSummary(response)}`
    );
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const reader = response.body.getReader();
    let timer;
    const read = async () => {
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return Buffer.concat(chunks).toString('utf8');
        bytes += value.byteLength;
        assert.ok(bytes <= 2 * 1024 * 1024, 'bounded response size');
        chunks.push(Buffer.from(value));
      }
    };
    let body;
    try {
      body = await Promise.race([
        read(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Full body deadline exceeded')),
            20_000
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => {});
    }
    assert.match(
      body,
      new RegExp(`<h1\\b[^>]*>${title}</h1>`),
      `${path} must render the translated heading`
    );
    assert.ok(body.includes('</html>'), `${path} must finish the document`);
    assert.doesNotMatch(
      body,
      /BAILOUT_TO_CLIENT_SIDE_RENDERING|Expected the resume to render/
    );
    receipts.push({
      path,
      bytes: Buffer.byteLength(body),
      sha256: createHash('sha256').update(body).digest('hex'),
    });
  }
  try {
    await harness.listen();
    const identity = await harness.fetch('/api/build-info', {
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(
      identity.status,
      200,
      identity.status === 200
        ? '/api/build-info'
        : `/api/build-info: ${await failureSummary(identity)}`
    );
    const metadata = await identity.json();
    assert.equal(metadata.appName, 'parley');
    assert.equal(
      metadata.commitHash,
      sha,
      'serve the exact CI-built candidate'
    );
    const pages = [
      ['/en/access-denied', 'Access by invitation'],
      ['/vi/access-denied', 'Truy cập theo lời mời'],
    ];
    for (let i = 0; i < 4; i++) await probe(...pages[i % 2]);
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => probe(...pages[i % 2]))
    );
    console.log(
      JSON.stringify({
        sourceSha: sha,
        scope: 'local-built-worker-no-hosted-services',
        pages: receipts,
      })
    );
  } finally {
    await harness.close();
  }
});
