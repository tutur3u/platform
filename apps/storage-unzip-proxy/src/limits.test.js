import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_ARCHIVE_DOWNLOAD_BYTES,
  DEFAULT_MAX_ARCHIVE_ENTRIES,
  DEFAULT_MAX_EXTRACTED_ENTRY_BYTES,
  DEFAULT_MAX_TOTAL_EXTRACTED_BYTES,
  resolveUnzipProxyLimits,
} from './limits.js';

describe('storage unzip proxy limits', () => {
  it('keeps memory-sensitive defaults conservative', () => {
    assert.equal(DEFAULT_FETCH_TIMEOUT_MS, 600000);
    assert.equal(DEFAULT_MAX_ARCHIVE_DOWNLOAD_BYTES, 100 * 1024 * 1024);
    assert.equal(DEFAULT_MAX_ARCHIVE_ENTRIES, 2000);
    assert.equal(DEFAULT_MAX_EXTRACTED_ENTRY_BYTES, 50 * 1024 * 1024);
    assert.equal(DEFAULT_MAX_TOTAL_EXTRACTED_BYTES, 250 * 1024 * 1024);

    assert.deepEqual(resolveUnzipProxyLimits({}), {
      fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      maxArchiveDownloadBytes: DEFAULT_MAX_ARCHIVE_DOWNLOAD_BYTES,
      maxArchiveEntries: DEFAULT_MAX_ARCHIVE_ENTRIES,
      maxExtractedEntryBytes: DEFAULT_MAX_EXTRACTED_ENTRY_BYTES,
      maxTotalExtractedBytes: DEFAULT_MAX_TOTAL_EXTRACTED_BYTES,
    });
  });

  it('allows explicit positive integer overrides and ignores invalid values', () => {
    assert.deepEqual(
      resolveUnzipProxyLimits({
        DRIVE_UNZIP_PROXY_FETCH_TIMEOUT_MS: '42.9',
        DRIVE_UNZIP_PROXY_MAX_ARCHIVE_BYTES: '2097152',
        DRIVE_UNZIP_PROXY_MAX_ARCHIVE_ENTRIES: '0',
        DRIVE_UNZIP_PROXY_MAX_ENTRY_BYTES: '-1',
        DRIVE_UNZIP_PROXY_MAX_TOTAL_EXTRACTED_BYTES: 'not-a-number',
      }),
      {
        fetchTimeoutMs: 42,
        maxArchiveDownloadBytes: 2097152,
        maxArchiveEntries: DEFAULT_MAX_ARCHIVE_ENTRIES,
        maxExtractedEntryBytes: DEFAULT_MAX_EXTRACTED_ENTRY_BYTES,
        maxTotalExtractedBytes: DEFAULT_MAX_TOTAL_EXTRACTED_BYTES,
      }
    );
  });
});
