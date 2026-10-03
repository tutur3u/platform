// @vitest-environment node
import { StorageDownloadError } from '@tuturuuu/storage-core/storage-download-token';
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  encodeDownloadFilename,
  storageDownloadErrorResponse,
} from './storage-download-response';

it('preserves known statuses and retry headers while ignoring unknown errors', async () => {
  for (const status of [404, 429, 502, 503]) {
    const response = storageDownloadErrorResponse(
      new StorageDownloadError('Safe failure', status, 60)
    );
    expect(response?.status).toBe(status);
    expect(response?.headers.get('retry-after')).toBe('60');
    expect(await response?.json()).toMatchObject({ message: 'Safe failure' });
  }
  expect(storageDownloadErrorResponse(new Error('private details'))).toBeNull();
});
it('encodes every RFC5987 filename delimiter', () => {
  expect(encodeDownloadFilename("a'()*!.zip")).toBe('a%27%28%29%2A%21.zip');
});
