import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import { createUnzipProxyHandler, HttpError } from './handler.js';

const SHARED_TOKEN = 'synthetic-shared-token';
const LIMITS = {
  fetchTimeoutMs: 1000,
  maxArchiveDownloadBytes: 10,
  maxArchiveEntries: 3,
  maxExtractedEntryBytes: 5,
  maxTotalExtractedBytes: 8,
};

function sourceResponse({
  chunks = [new Uint8Array([1])],
  contentLength,
  ok = true,
  status = 200,
} = {}) {
  let index = 0;
  const reader = {
    cancel: vi.fn(async () => undefined),
    read: vi.fn(async () => {
      const value = chunks[index++];
      return value ? { done: false, value } : { done: true, value: undefined };
    }),
  };
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set('content-length', String(contentLength));
  }

  return {
    body: { getReader: () => reader },
    headers,
    ok,
    reader,
    status,
  };
}

function fileEntry(entryPath, body, uncompressedSize = body.byteLength) {
  return {
    buffer: vi.fn(async () => body),
    path: entryPath,
    type: 'File',
    uncompressedSize,
  };
}

function directoryEntry(entryPath) {
  return {
    buffer: vi.fn(),
    path: entryPath,
    type: 'Directory',
    uncompressedSize: 0,
  };
}

function createFixture(overrides = {}) {
  const fetchFn = overrides.fetchFn ?? vi.fn(async () => sourceResponse());
  const parseArchive =
    overrides.parseArchive ?? vi.fn(async () => ({ files: [] }));
  const postDirectory = overrides.postDirectory ?? vi.fn(async () => undefined);
  const uploadFile = overrides.uploadFile ?? vi.fn(async () => undefined);
  const handler = createUnzipProxyHandler({
    fetchFn,
    limits: overrides.limits ?? LIMITS,
    parseArchive,
    postDirectory,
    sharedToken: overrides.sharedToken ?? SHARED_TOKEN,
    uploadFile,
  });

  return { fetchFn, handler, parseArchive, postDirectory, uploadFile };
}

function request({
  authorization = `Bearer ${SHARED_TOKEN}`,
  body = {
    callbackToken: 'synthetic-callback-token',
    callbackUrl: 'https://callback.example.test/upload',
    destinationPrefix: 'extracted//files/',
    sourceUrl: 'https://source.example.test/archive.zip',
  },
  method = 'POST',
  path = '/extract',
  rawBody,
} = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (authorization !== null) headers.set('Authorization', authorization);

  return new Request(`https://proxy.example.test${path}`, {
    body: method === 'GET' ? undefined : (rawBody ?? JSON.stringify(body)),
    headers,
    method,
  });
}

async function responseJson(response) {
  return response.json();
}

function assertNoExtractionCalls(fixture) {
  assert.equal(fixture.fetchFn.mock.calls.length, 0);
  assert.equal(fixture.parseArchive.mock.calls.length, 0);
  assert.equal(fixture.postDirectory.mock.calls.length, 0);
  assert.equal(fixture.uploadFile.mock.calls.length, 0);
}

describe('request boundary', () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  it.each([
    ['missing bearer', null],
    ['wrong bearer', 'Bearer wrong-synthetic-token'],
  ])(
    'rejects %s before download, parsing, or uploads',
    async (_, authorization) => {
      const response = await fixture.handler(request({ authorization }));

      assert.equal(response.status, 401);
      assert.deepEqual(await responseJson(response), {
        message: 'Unauthorized',
      });
      assertNoExtractionCalls(fixture);
    }
  );

  it('keeps health available without credentials', async () => {
    const response = await fixture.handler(
      request({ authorization: null, method: 'GET', path: '/health' })
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { ok: true });
    assertNoExtractionCalls(fixture);
  });

  it.each([
    ['wrong method', { method: 'GET', path: '/extract' }],
    ['wrong path', { method: 'POST', path: '/other' }],
  ])('returns 404 for a %s', async (_, input) => {
    const response = await fixture.handler(request(input));

    assert.equal(response.status, 404);
    assertNoExtractionCalls(fixture);
  });

  it('rejects malformed JSON before extraction', async () => {
    const response = await fixture.handler(request({ rawBody: '{' }));

    assert.equal(response.status, 400);
    assert.deepEqual(await responseJson(response), {
      message: 'Invalid request body',
    });
    assertNoExtractionCalls(fixture);
  });

  it.each([
    ['missing fields', {}],
    [
      'non-HTTP source URL',
      {
        callbackToken: 'callback-token',
        callbackUrl: 'https://callback.example.test/upload',
        sourceUrl: 'file:///tmp/archive.zip',
      },
    ],
    [
      'non-HTTP callback URL',
      {
        callbackToken: 'callback-token',
        callbackUrl: 'ftp://callback.example.test/upload',
        sourceUrl: 'https://source.example.test/archive.zip',
      },
    ],
  ])('rejects %s before download', async (_, body) => {
    const response = await fixture.handler(request({ body }));

    assert.equal(response.status, 400);
    assertNoExtractionCalls(fixture);
  });

  it.each(['../outside', './relative', 'safe/../../outside'])(
    'rejects invalid destination prefix %s before download',
    async (destinationPrefix) => {
      const response = await fixture.handler(
        request({
          body: {
            callbackToken: 'callback-token',
            callbackUrl: 'https://callback.example.test/upload',
            destinationPrefix,
            sourceUrl: 'https://source.example.test/archive.zip',
          },
        })
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await responseJson(response), {
        message: 'Invalid destination prefix',
      });
      assertNoExtractionCalls(fixture);
    }
  );

  it('normalizes URLs and prefixes and maps successful counts', async () => {
    const file = fileEntry('assets/app.js', Buffer.from('ok'));
    fixture.parseArchive.mockResolvedValue({ files: [file] });

    const response = await fixture.handler(request());

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), {
      files: 1,
      folders: 0,
      message: 'Extracted 1 file(s) and 0 folder(s).',
    });
    assert.deepEqual(fixture.fetchFn.mock.calls[0], [
      'https://source.example.test/archive.zip',
      { cache: 'no-store', method: 'GET' },
    ]);
    assert.equal(fixture.parseArchive.mock.calls.length, 1);
    assert.deepEqual(fixture.uploadFile.mock.calls[0][0], {
      body: Buffer.from('ok'),
      callbackToken: 'synthetic-callback-token',
      callbackUrl: 'https://callback.example.test/upload',
      contentType: 'application/javascript',
      filePath: 'extracted/files/assets/app.js',
    });
  });
});

describe('archive and extraction limits', () => {
  it('rejects oversized declared archive length before body consumption', async () => {
    const source = sourceResponse({ contentLength: 11 });
    const fixture = createFixture({ fetchFn: vi.fn(async () => source) });

    const response = await fixture.handler(request());

    assert.equal(response.status, 413);
    assert.equal(source.reader.read.mock.calls.length, 0);
    assert.equal(fixture.parseArchive.mock.calls.length, 0);
    assert.equal(fixture.uploadFile.mock.calls.length, 0);
  });

  it.each([undefined, 1])(
    'cancels streamed archive overflow with content length %s',
    async (contentLength) => {
      const source = sourceResponse({
        chunks: [new Uint8Array(6), new Uint8Array(5)],
        contentLength,
      });
      const fixture = createFixture({ fetchFn: vi.fn(async () => source) });

      const response = await fixture.handler(request());

      assert.equal(response.status, 413);
      assert.equal(source.reader.cancel.mock.calls.length, 1);
      assert.equal(fixture.parseArchive.mock.calls.length, 0);
    }
  );

  it('maps a missing source response body to 502', async () => {
    const fixture = createFixture({
      fetchFn: vi.fn(async () => ({
        body: null,
        headers: new Headers(),
        ok: true,
        status: 200,
      })),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 502);
    assert.deepEqual(await responseJson(response), {
      message: 'Failed to read ZIP archive response body.',
    });
    assert.equal(fixture.parseArchive.mock.calls.length, 0);
  });

  it('maps a failed source response to 502 without reading it', async () => {
    const source = sourceResponse({ ok: false, status: 404 });
    const fixture = createFixture({ fetchFn: vi.fn(async () => source) });

    const response = await fixture.handler(request());

    assert.equal(response.status, 502);
    assert.equal(source.reader.read.mock.calls.length, 0);
    assert.equal(fixture.parseArchive.mock.calls.length, 0);
  });

  it('maps parser failure without attempting uploads', async () => {
    const fixture = createFixture({
      parseArchive: vi.fn(async () => {
        throw new Error('synthetic parser failure');
      }),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 500);
    assert.deepEqual(await responseJson(response), {
      message: 'synthetic parser failure',
    });
    assert.equal(fixture.uploadFile.mock.calls.length, 0);
  });

  it('rejects entry-count overflow before touching any entry', async () => {
    const entries = Array.from({ length: 4 }, (_, index) =>
      fileEntry(`${index}.txt`, Buffer.from('a'))
    );
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: entries })),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 413);
    assert.equal(entries[0].buffer.mock.calls.length, 0);
    assert.equal(fixture.uploadFile.mock.calls.length, 0);
  });

  it('stops before buffering a declared oversized entry or later entries', async () => {
    const oversized = fileEntry('large.bin', Buffer.alloc(1), 6);
    const later = fileEntry('later.txt', Buffer.from('a'));
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: [oversized, later] })),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 413);
    assert.equal(oversized.buffer.mock.calls.length, 0);
    assert.equal(later.buffer.mock.calls.length, 0);
    assert.equal(fixture.uploadFile.mock.calls.length, 0);
  });

  it('stops before buffering declared cumulative overflow', async () => {
    const first = fileEntry('first.txt', Buffer.alloc(3));
    const overflow = fileEntry('overflow.txt', Buffer.alloc(1), 6);
    const later = fileEntry('later.txt', Buffer.alloc(1));
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: [first, overflow, later] })),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 413);
    assert.equal(fixture.uploadFile.mock.calls.length, 1);
    assert.equal(overflow.buffer.mock.calls.length, 0);
    assert.equal(later.buffer.mock.calls.length, 0);
  });

  it('stops after buffering actual per-entry overflow', async () => {
    const oversized = fileEntry('large.bin', Buffer.alloc(6), 0);
    const later = fileEntry('later.txt', Buffer.alloc(1));
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: [oversized, later] })),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 413);
    assert.equal(oversized.buffer.mock.calls.length, 1);
    assert.equal(later.buffer.mock.calls.length, 0);
    assert.equal(fixture.uploadFile.mock.calls.length, 0);
  });

  it('stops after buffering actual cumulative overflow', async () => {
    const first = fileEntry('first.txt', Buffer.alloc(4), 0);
    const overflow = fileEntry('overflow.txt', Buffer.alloc(5), 0);
    const later = fileEntry('later.txt', Buffer.alloc(1));
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: [first, overflow, later] })),
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 413);
    assert.equal(fixture.uploadFile.mock.calls.length, 1);
    assert.equal(overflow.buffer.mock.calls.length, 1);
    assert.equal(later.buffer.mock.calls.length, 0);
  });

  it('skips invalid paths and uploads directories and files with MIME types', async () => {
    const invalid = fileEntry('../escape.txt', Buffer.from('no'));
    const directory = directoryEntry('assets/');
    const html = fileEntry('index.html', Buffer.from('html'));
    const compressedWasm = fileEntry('game.wasm.gz', Buffer.from('wasm'));
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({
        files: [invalid, directory, html, compressedWasm],
      })),
      limits: { ...LIMITS, maxArchiveEntries: 4, maxTotalExtractedBytes: 10 },
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), {
      files: 2,
      folders: 1,
      message: 'Extracted 2 file(s) and 1 folder(s).',
    });
    assert.equal(invalid.buffer.mock.calls.length, 0);
    assert.deepEqual(fixture.postDirectory.mock.calls[0][0], {
      body: '',
      callbackToken: 'synthetic-callback-token',
      callbackUrl: 'https://callback.example.test/upload',
      contentType: 'text/plain',
      filePath: 'extracted/files/assets',
      operation: 'folder',
    });
    assert.equal(fixture.uploadFile.mock.calls[0][0].contentType, 'text/html');
    assert.equal(
      fixture.uploadFile.mock.calls[1][0].contentType,
      'application/wasm'
    );
  });
});

describe('partial upload failure', () => {
  it('does not roll back an earlier upload when a middle callback fails and stops later entries', async () => {
    const first = fileEntry('first.txt', Buffer.from('a'));
    const directory = directoryEntry('middle/');
    const later = fileEntry('later.txt', Buffer.from('b'));
    const postDirectory = vi.fn(async () => {
      throw new HttpError(409, 'synthetic callback conflict');
    });
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: [first, directory, later] })),
      postDirectory,
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 409);
    assert.deepEqual(await responseJson(response), {
      message: 'synthetic callback conflict',
    });
    assert.equal(fixture.uploadFile.mock.calls.length, 1);
    assert.equal(postDirectory.mock.calls.length, 1);
    assert.equal(later.buffer.mock.calls.length, 0);
  });

  it('does not roll back an earlier upload when a middle signed upload fails and stops later entries', async () => {
    const first = fileEntry('first.txt', Buffer.from('a'));
    const middle = fileEntry('middle.txt', Buffer.from('b'));
    const later = fileEntry('later.txt', Buffer.from('c'));
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new HttpError(502, 'synthetic upload failure'));
    const fixture = createFixture({
      parseArchive: vi.fn(async () => ({ files: [first, middle, later] })),
      uploadFile,
    });

    const response = await fixture.handler(request());

    assert.equal(response.status, 502);
    assert.deepEqual(await responseJson(response), {
      message: 'synthetic upload failure',
    });
    assert.equal(uploadFile.mock.calls.length, 2);
    assert.equal(later.buffer.mock.calls.length, 0);
  });
});
