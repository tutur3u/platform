import { WorkspaceStorageError } from './storage-download-error';

/** Only server-owned direct buffers may explicitly opt into empty files. */
export function assertStorageUploadSize(
  size: number | undefined,
  allowEmpty = false
): asserts size is number {
  if (
    size === undefined ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    (size === 0 && !allowEmpty)
  ) {
    throw new WorkspaceStorageError(
      'A valid file size is required for storage uploads.',
      400
    );
  }
}
