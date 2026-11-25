// Post-upload module compare for wave-1 production publication. After the
// version-only upload and before any traffic moves, the uploaded version's
// module names are read back from Cloudflare and compared with the emitted
// cf Build Output manifest. The versions API returns every module's content
// (about 17 MB for Finance), so the response is streamed through a small JSON
// scanner that keeps only result.modules[].name, result.main_module, success
// and error messages, and discards module content as it passes. The read has
// its own byte limit, derived from the measured upload, and a 15 s timeout.
import assert from 'node:assert/strict';
import { assertUploadedModuleSet } from './cf-build-output-publisher.mjs';

export const MODULE_READ_TIMEOUT_MS = 15_000;
const MAX_KEPT_STRING = 4096;
const MAX_LITERAL = 64;

/**
 * The response byte limit for a version with the measured upload: base64
 * content of every module plus per-module metadata and a 1 MiB envelope.
 */
export function moduleReadLimit(measurements) {
  const bytes = measurements?.script?.bytes;
  const count = measurements?.script?.moduleCount;
  assert.ok(
    Number.isSafeInteger(bytes) && bytes > 0 && Number.isSafeInteger(count),
    'Upload measurements are required to bound the module read'
  );
  return Math.ceil((bytes * 4) / 3) + count * 2048 + 1024 * 1024;
}

const whitespace = new Set([' ', '\t', '\n', '\r']);
const escapes = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * A streaming JSON scanner that keeps only the fields the compare needs.
 * Feed it text chunks, then call finish(); malformed or truncated JSON throws.
 */
export function createModuleNameScanner() {
  const stack = [];
  const out = {
    success: undefined,
    mainModule: undefined,
    names: [],
    errors: [],
  };
  let state = 'value';
  let isKey = false;
  let target = null;
  let buffer = '';
  let unicode = '';
  let literal = '';
  let done = false;

  const wanted = () => {
    const path = stack.map((frame) =>
      frame.type === 'object' ? frame.key : frame.index
    );
    const [a, b, c, d] = path;
    if (path.length === 1 && a === 'success') return 'success';
    if (path.length === 2 && a === 'result' && b === 'main_module')
      return 'main';
    if (
      path.length === 4 &&
      a === 'result' &&
      b === 'modules' &&
      typeof c === 'number' &&
      d === 'name'
    )
      return 'name';
    if (
      path.length === 3 &&
      a === 'errors' &&
      typeof b === 'number' &&
      c === 'message'
    )
      return 'error';
    return null;
  };
  const afterValue = () => {
    if (stack.length === 0) {
      done = true;
      state = 'end';
    } else state = 'after';
  };
  const keep = (value) => {
    if (target === 'main') out.mainModule = value;
    else if (target === 'name') out.names.push(value);
    else if (target === 'error') out.errors.push(value.slice(0, 200));
  };
  const endLiteral = () => {
    if (target === 'success') out.success = literal === 'true';
    assert.ok(
      /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/u.test(literal),
      'Malformed module listing'
    );
    afterValue();
  };
  const step = (ch) => {
    switch (state) {
      case 'value': {
        if (whitespace.has(ch)) return;
        const top = stack.at(-1);
        if (top?.type === 'array') {
          if (ch === ']' && top.index === -1) {
            stack.pop();
            afterValue();
            return;
          }
          top.index += 1;
        }
        if (ch === '{') {
          stack.push({ type: 'object', key: null });
          state = 'key';
        } else if (ch === '[') {
          stack.push({ type: 'array', index: -1 });
          state = 'value';
        } else if (ch === '"') {
          isKey = false;
          target = wanted();
          buffer = '';
          state = 'string';
        } else if (/[-\dtfn]/u.test(ch)) {
          target = wanted();
          literal = ch;
          state = 'literal';
        } else assert.fail('Malformed module listing');
        return;
      }
      case 'key':
        if (whitespace.has(ch)) return;
        if (ch === '}' && stack.at(-1).key === null) {
          stack.pop();
          afterValue();
          return;
        }
        assert.equal(ch, '"', 'Malformed module listing');
        isKey = true;
        buffer = '';
        state = 'string';
        return;
      case 'colon':
        if (whitespace.has(ch)) return;
        assert.equal(ch, ':', 'Malformed module listing');
        state = 'value';
        return;
      case 'string': {
        const keeping = isKey || target !== null;
        if (ch === '\\') state = 'escape';
        else if (ch === '"') {
          if (isKey) {
            stack.at(-1).key = buffer;
            state = 'colon';
          } else {
            if (target !== null && target !== 'success') keep(buffer);
            afterValue();
          }
        } else if (keeping) {
          assert.ok(
            buffer.length < MAX_KEPT_STRING,
            'Module listing field too long'
          );
          buffer += ch;
        }
        return;
      }
      case 'escape':
        if (ch === 'u') {
          unicode = '';
          state = 'unicode';
          return;
        }
        assert.ok(Object.hasOwn(escapes, ch), 'Malformed module listing');
        if (isKey || target !== null) buffer += escapes[ch];
        state = 'string';
        return;
      case 'unicode':
        assert.ok(/[\da-fA-F]/u.test(ch), 'Malformed module listing');
        unicode += ch;
        if (unicode.length === 4) {
          if (isKey || target !== null)
            buffer += String.fromCharCode(Number.parseInt(unicode, 16));
          state = 'string';
        }
        return;
      case 'literal':
        if (/[\w.+-]/u.test(ch)) {
          assert.ok(literal.length < MAX_LITERAL, 'Malformed module listing');
          literal += ch;
          return;
        }
        endLiteral();
        step(ch);
        return;
      case 'after': {
        if (whitespace.has(ch)) return;
        const top = stack.at(-1);
        if (ch === ',') state = top.type === 'object' ? 'key' : 'value';
        else if (ch === '}' && top.type === 'object') {
          stack.pop();
          afterValue();
        } else if (ch === ']' && top.type === 'array') {
          stack.pop();
          afterValue();
        } else assert.fail('Malformed module listing');
        return;
      }
      case 'end':
        assert.ok(whitespace.has(ch), 'Malformed module listing');
        return;
      default:
        assert.fail('Malformed module listing');
    }
  };
  return {
    feed(text) {
      for (const ch of text) step(ch);
    },
    finish() {
      if (state === 'literal' && stack.length === 0) endLiteral();
      assert.ok(done, 'Module listing is truncated');
      return out;
    },
  };
}

/**
 * Streams a version's module listing and returns its names, main module and
 * success flag without keeping module content. Throws on an HTTP or API
 * error, a body over maxBytes, a truncated or malformed body, or a timeout.
 */
export async function readUploadedModuleNames({
  url,
  token,
  fetcher = fetch,
  maxBytes,
  timeoutMs = MODULE_READ_TIMEOUT_MS,
}) {
  assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0);
  const response = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert.ok(response.ok, `Uploaded module listing failed (${response.status})`);
  const declared = Number(response.headers.get('content-length'));
  assert.ok(
    !Number.isFinite(declared) || declared <= maxBytes,
    'Uploaded module listing exceeds its byte limit'
  );
  const scanner = createModuleNameScanner();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      assert.ok(
        bytes <= maxBytes,
        'Uploaded module listing exceeds its byte limit'
      );
      scanner.feed(decoder.decode(value, { stream: true }));
    }
    scanner.feed(decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }
  const listing = scanner.finish();
  assert.equal(
    listing.success,
    true,
    `Uploaded module listing reported an API error${listing.errors.length ? `: ${listing.errors.join('; ')}` : ''}`
  );
  return { ...listing, bytes };
}

const normalize = (name) =>
  name.replaceAll('\\', '/').replace(/^(?:\.\/|\/)+/u, '');

/** Names-only differences between the uploaded and emitted module sets. */
export function moduleSetDifference(uploadedNames, expectedModules) {
  const uploaded = uploadedNames
    .map(normalize)
    .filter((name) => /\.(?:m?js)$/u.test(name));
  const seen = new Set();
  const duplicates = [];
  for (const name of uploaded) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
  }
  const expected = new Set(Object.keys(expectedModules).map(normalize));
  return {
    uploaded: seen.size,
    expected: expected.size,
    onlySealed: [...expected].filter((name) => !seen.has(name)).sort(),
    onlyUploaded: [...seen].filter((name) => !expected.has(name)).sort(),
    duplicates: [...new Set(duplicates)].sort(),
  };
}

/**
 * Reads the uploaded version's module names and compares them with the
 * emitted manifest. Records the outcome (names only) in the receipt; any
 * difference or read failure fails closed before staging.
 */
export async function compareUploadedModules({
  record,
  save,
  manifest,
  accountId,
  worker,
  token,
  fetcher = fetch,
  timeoutMs,
}) {
  assert.equal(record.state, 'uploaded-version', 'Compare needs a version');
  let listing;
  try {
    assert.ok(
      manifest?.modules && manifest.mainModule,
      'Emitted module manifest is unavailable'
    );
    listing = await readUploadedModuleNames({
      url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/workers/${worker}/versions/${record.versionId}?include=modules`,
      token,
      fetcher,
      maxBytes: moduleReadLimit(record.measurements),
      timeoutMs,
    });
  } catch (error) {
    record.state = 'module-compare-failed';
    record.moduleCompare = {
      state: 'failed',
      error:
        error instanceof Error
          ? error.message.split('\n')[0].slice(0, 300)
          : 'unknown read error',
    };
    save();
    throw new Error(
      `Uploaded module compare failed (${record.moduleCompare.error}); no traffic moved`
    );
  }
  const difference = moduleSetDifference(listing.names, manifest.modules);
  const mainMatches =
    normalize(listing.mainModule ?? '') === normalize(manifest.mainModule);
  record.moduleCompare = {
    ...difference,
    mainModule: {
      uploaded: listing.mainModule ?? null,
      expected: manifest.mainModule,
    },
    responseBytes: listing.bytes,
  };
  try {
    assert.ok(mainMatches, 'uploaded main module differs from the manifest');
    assertUploadedModuleSet(listing.names, manifest.modules);
  } catch (error) {
    record.state = 'module-mismatch';
    record.moduleCompare.state = 'mismatch';
    save();
    throw new Error(
      `Uploaded modules differ from the emitted manifest (${error instanceof Error ? error.message.split('\n')[0] : 'mismatch'}; ${difference.onlySealed.length} only sealed, ${difference.onlyUploaded.length} only uploaded, ${difference.duplicates.length} repeated); no traffic moved`
    );
  }
  record.moduleCompare.state = 'match';
  save();
  return record;
}
