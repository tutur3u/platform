import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareUploadedModules,
  createModuleNameScanner,
  moduleReadLimit,
  readUploadedModuleNames,
} from './wave1-uploaded-modules.mjs';

const manifest = {
  mainModule: 'index.js',
  modules: {
    'index.js': { type: 'esm' },
    'rsc/bridge-api.js': { type: 'esm' },
    'chunks/a.mjs': { type: 'esm' },
  },
};
const secret = 'Y29udGVudC1ib2R5'.repeat(64);

function listing(names, { mainModule = 'index.js', extra = {} } = {}) {
  return JSON.stringify({
    success: true,
    errors: [],
    result: {
      id: 'v',
      main_module: mainModule,
      bindings: [{ name: 'NOT_A_MODULE', type: 'plain_text' }],
      modules: names.map((name) => ({
        name,
        content_type: 'application/javascript+module',
        content_base64: secret,
      })),
      ...extra,
    },
  });
}

// Streams `body` in small chunks, optionally cut short.
function streamed(body, { chunk = 7, cutAt, status = 200, length } = {}) {
  const bytes = new TextEncoder().encode(body);
  const end = cutAt ?? bytes.length;
  return async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < end; i += chunk)
            controller.enqueue(bytes.slice(i, Math.min(i + chunk, end)));
          controller.close();
        },
      }),
      {
        status,
        headers:
          length === undefined ? {} : { 'content-length': String(length) },
      }
    );
}

const measurements = { script: { bytes: 64 * 1024, moduleCount: 3 } };

function compare(fetcher) {
  const record = {
    state: 'uploaded-version',
    versionId: '22222222-2222-2222-2222-222222222222',
    measurements,
  };
  const saves = [];
  return {
    record,
    saves,
    run: () =>
      compareUploadedModules({
        record,
        save: () => saves.push(JSON.stringify(record)),
        manifest,
        accountId: 'a'.repeat(32),
        worker: 'tuturuuu-finance',
        token: 'deploy',
        fetcher,
      }),
  };
}

const all = Object.keys(manifest.modules);

test('a matching upload passes and records names only', async () => {
  const c = compare(streamed(listing(all)));
  await c.run();
  assert.equal(c.record.moduleCompare.state, 'match');
  assert.deepEqual(c.record.moduleCompare.onlySealed, []);
  assert.deepEqual(c.record.moduleCompare.onlyUploaded, []);
  assert.equal(c.record.state, 'uploaded-version');
  for (const saved of c.saves) assert.ok(!saved.includes(secret));
});

for (const [name, names, message, field, expected] of [
  [
    'a dropped module graph',
    ['index.js', 'chunks/a.mjs'],
    /1 only sealed, 0 only uploaded/,
    'onlySealed',
    ['rsc/bridge-api.js'],
  ],
  [
    'an extra module',
    [...all, 'stray.js'],
    /0 only sealed, 1 only uploaded/,
    'onlyUploaded',
    ['stray.js'],
  ],
  [
    'a repeated module',
    [...all, './index.js'],
    /1 repeated/,
    'duplicates',
    ['index.js'],
  ],
]) {
  test(`${name} fails closed with the difference recorded`, async () => {
    const c = compare(streamed(listing(names)));
    await assert.rejects(c.run(), message);
    assert.equal(c.record.state, 'module-mismatch');
    assert.equal(c.record.moduleCompare.state, 'mismatch');
    assert.deepEqual(c.record.moduleCompare[field], expected);
    assert.ok(!JSON.stringify(c.record).includes(secret));
  });
}

test('a different main module fails closed', async () => {
  const c = compare(streamed(listing(all, { mainModule: 'chunks/a.mjs' })));
  await assert.rejects(c.run(), /main module differs/);
  assert.equal(c.record.state, 'module-mismatch');
});

for (const [name, fetcher, message] of [
  ['a truncated stream', streamed(listing(all), { cutAt: 300 }), /truncated/],
  [
    'a body over the byte limit',
    streamed(listing(all, { extra: { padding: 'x'.repeat(2_000_000) } })),
    /exceeds its byte limit/,
  ],
  [
    'a declared length over the byte limit',
    streamed(listing(all), { length: 50_000_000 }),
    /exceeds its byte limit/,
  ],
  [
    'an API error',
    streamed(
      JSON.stringify({
        success: false,
        errors: [{ code: 10007, message: 'version not found' }],
        result: null,
      })
    ),
    /API error: version not found/,
  ],
  [
    'an HTTP error',
    streamed('{"success":false}', { status: 500 }),
    /listing failed \(500\)/,
  ],
  ['malformed JSON', streamed('{"success":tru}'), /Malformed/],
]) {
  test(`${name} fails closed before staging`, async () => {
    const c = compare(fetcher);
    await assert.rejects(c.run(), message);
    assert.equal(c.record.state, 'module-compare-failed');
    assert.equal(c.record.moduleCompare.state, 'failed');
  });
}

test('the scanner keeps names across chunk splits and ignores other names', () => {
  const body = JSON.stringify({
    result: {
      modules: [
        { name: 'résumé/\\"quoted\\".js', content_base64: secret },
        { name: 'a\\u0041.js' },
      ],
      main_module: 'index.js',
      bindings: [{ name: 'IGNORED' }],
    },
    success: true,
  });
  for (const size of [1, 2, 3, 5, 13]) {
    const scanner = createModuleNameScanner();
    for (let i = 0; i < body.length; i += size)
      scanner.feed(body.slice(i, i + size));
    const out = scanner.finish();
    assert.deepEqual(out.names, ['résumé/\\"quoted\\".js', 'a\\u0041.js']);
    assert.equal(out.mainModule, 'index.js');
    assert.equal(out.success, true);
  }
});

test('the read limit follows the measured upload', () => {
  assert.equal(
    moduleReadLimit({ script: { bytes: 3000, moduleCount: 2 } }),
    4000 + 4096 + 1024 * 1024
  );
  assert.throws(() => moduleReadLimit({}), /measurements are required/);
});

test('the read sends the deploy credential with a bounded timeout', async () => {
  let seen;
  await readUploadedModuleNames({
    url: 'https://api.example/v?include=modules',
    token: 'deploy',
    maxBytes: 1_000_000,
    fetcher: async (url, options) => {
      seen = options;
      return streamed(listing(all))();
    },
  });
  assert.equal(seen.headers.Authorization, 'Bearer deploy');
  assert.equal(seen.redirect, 'error');
  assert.ok(seen.signal);
});
