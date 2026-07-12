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
});
