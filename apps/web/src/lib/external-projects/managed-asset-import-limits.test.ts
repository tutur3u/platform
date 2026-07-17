import { describe, expect, it } from 'vitest';
import {
  chunkManagedAssetImportIds,
  MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES,
  MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS,
  sanitizeManagedAssetImportFailureMessage,
} from './managed-asset-import-limits';

const protectedJsonFieldByteLimit = 8 * 1024;
const pathologicalFailureMessage = ['"', '\\', String.fromCharCode(0), '😀']
  .join('')
  .repeat(300);
const assetId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const reportBytes = (
  count: number,
  processedCount = 0,
  failures: Array<{ assetId: string; message: string }> = []
) =>
  new TextEncoder().encode(
    JSON.stringify({
      assetIds: Array.from({ length: count }, (_, index) => assetId(index)),
      failures,
      processedAssetIds: Array.from({ length: processedCount }, (_, index) =>
        assetId(index)
      ),
      total: count,
    })
  ).byteLength;

describe('managed asset import job limits', () => {
  it('chunks bulk selections into resumable jobs within the server limit', () => {
    const chunks = chunkManagedAssetImportIds(
      Array.from({ length: 217 }, (_, index) => assetId(index))
    );

    expect(chunks.map((chunk) => chunk.length)).toEqual([75, 75, 67]);
    expect(chunks.flat()).toEqual(
      Array.from({ length: 217 }, (_, index) => assetId(index))
    );
    expect(chunkManagedAssetImportIds([])).toEqual([]);
  });

  it('keeps a failed final batch below the protected JSON field limit', () => {
    const failureMessage = sanitizeManagedAssetImportFailureMessage(
      pathologicalFailureMessage
    );
    const failures = Array.from({ length: 5 }, (_, index) => ({
      assetId: assetId(MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS - 5 + index),
      message: failureMessage,
    }));

    expect(
      reportBytes(
        MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS,
        MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS - 5,
        failures
      )
    ).toBeLessThanOrEqual(protectedJsonFieldByteLimit);
  });

  it('covers the production regression where 100 assets overflow late', () => {
    const failures = Array.from({ length: 5 }, (_, index) => ({
      assetId: assetId(95 + index),
      message: 'x'.repeat(MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES),
    }));

    expect(reportBytes(100, 95, failures)).toBeGreaterThan(
      protectedJsonFieldByteLimit
    );
    expect(reportBytes(217)).toBeGreaterThan(protectedJsonFieldByteLimit);
  });

  it('bounds and JSON-sanitizes persisted failure messages by UTF-8 bytes', () => {
    const message = sanitizeManagedAssetImportFailureMessage(
      pathologicalFailureMessage
    );

    expect(new TextEncoder().encode(message).byteLength).toBeLessThanOrEqual(
      MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES
    );
    expect(message).not.toMatch(/["\\]/);
    expect(message).not.toContain('\u0000');
  });
});
