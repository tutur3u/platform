import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  readSyncManifestRequest,
  SyncManifestRequestBodyError,
} from './shared';

const manifest = {
  adapter: 'exocorpse',
  content: { entries: [] },
  schema: { collections: [] },
  version: 1,
} as const;

describe('readSyncManifestRequest', () => {
  it('parses an identity-encoded manifest request', async () => {
    const request = new Request('https://example.com/sync', {
      body: JSON.stringify({ manifest }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    await expect(readSyncManifestRequest(request)).resolves.toEqual({
      manifest,
    });
  });

  it('parses a gzip-compressed manifest request', async () => {
    const body = gzipSync(JSON.stringify({ force: true, manifest }));
    const request = new Request('https://example.com/sync', {
      body,
      headers: {
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    await expect(readSyncManifestRequest(request)).resolves.toEqual({
      force: true,
      manifest,
    });
  });

  it('rejects unsupported content encodings', async () => {
    const request = new Request('https://example.com/sync', {
      body: JSON.stringify({ manifest }),
      headers: { 'Content-Encoding': 'br' },
      method: 'POST',
    });

    await expect(readSyncManifestRequest(request)).rejects.toBeInstanceOf(
      SyncManifestRequestBodyError
    );
  });

  it('rejects an oversized compressed request before buffering it', async () => {
    const request = new Request('https://example.com/sync', {
      body: gzipSync(JSON.stringify({ manifest })),
      headers: {
        'Content-Encoding': 'gzip',
        'Content-Length': String(4 * 1024 * 1024 + 1),
      },
      method: 'POST',
    });

    await expect(readSyncManifestRequest(request)).rejects.toBeInstanceOf(
      SyncManifestRequestBodyError
    );
  });

  it.each([
    {
      body: Buffer.from('not-gzip'),
      contentEncoding: 'gzip',
      name: 'invalid gzip data',
    },
    {
      body: gzipSync('{ invalid json'),
      contentEncoding: 'gzip',
      name: 'invalid gzip JSON',
    },
    {
      body: '{ invalid json',
      contentEncoding: 'identity',
      name: 'invalid identity JSON',
    },
    {
      body: gzipSync('x'.repeat(16 * 1024 * 1024 + 1)),
      contentEncoding: 'gzip',
      name: 'an oversized decompressed body',
    },
  ])('rejects $name', async ({ body, contentEncoding }) => {
    const request = new Request('https://example.com/sync', {
      body,
      headers: { 'Content-Encoding': contentEncoding },
      method: 'POST',
    });

    await expect(readSyncManifestRequest(request)).rejects.toBeInstanceOf(
      SyncManifestRequestBodyError
    );
  });
});
