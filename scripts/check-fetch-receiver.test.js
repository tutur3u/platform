const assert = require('node:assert/strict');
const { test } = require('node:test');
const { unsafeFetchReceivers } = require('./check-fetch-receiver.js');

test('flags raw fetch passed into Worker dependencies', () => {
  const source = [
    'forward(request, {',
    '  fetch,',
    '  fetchImpl: globalThis.fetch,',
    "  fetcher: globalThis['fetch'],",
    '});',
  ].join('\n');
  assert.deepEqual(unsafeFetchReceivers(source, 'route.ts'), [2, 3, 4]);
});

test('flags raw globals stored as client methods', () => {
  const source = [
    'class Client {',
    '  fetcher = fetch;',
    '  constructor(options: { fetch?: typeof fetch }) {',
    '    this.fetchImpl = options.fetch ?? globalThis.fetch;',
    '  }',
    '}',
  ].join('\n');
  assert.deepEqual(unsafeFetchReceivers(source, 'client.ts'), [2, 4]);
});

test('flags raw fetch behind conditional or TypeScript syntax', () => {
  const source = [
    'class Client {',
    '  #fetchImpl = globalThis.fetch as typeof fetch;',
    '  constructor(custom: typeof fetch) {',
    '    this.#fetchImpl = custom ? custom : fetch!;',
    '  }',
    '}',
    'forward(request, { fetch: (fetch satisfies typeof fetch) });',
  ].join('\n');
  assert.deepEqual(unsafeFetchReceivers(source, 'route.ts'), [2, 4, 7]);
});

test('allows bound functions, wrappers, and standalone fetch', () => {
  const source = [
    '// An object containing { fetch } in a comment',
    'const deps = { fetch: globalThis.fetch.bind(globalThis) };',
    'const { fetch: fetchUpstream } = deps;',
    'forward(request, { fetch: (...args) => globalThis.fetch(...args) });',
    'fetchUpstream(url);',
    'globalThis.fetch(url);',
  ].join('\n');
  assert.deepEqual(unsafeFetchReceivers(source, 'route.ts'), []);
});
