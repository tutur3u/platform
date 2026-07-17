export const MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS = 75;
export const MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES = 256;

export function chunkManagedAssetImportIds(assetIds: string[]) {
  return Array.from(
    {
      length: Math.ceil(assetIds.length / MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS),
    },
    (_, index) =>
      assetIds.slice(
        index * MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS,
        (index + 1) * MAX_MANAGED_ASSET_IMPORT_JOB_ASSETS
      )
  );
}

export function sanitizeManagedAssetImportFailureMessage(value: string) {
  const jsonSafe = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || character === '"' || character === '\\'
      ? ' '
      : character;
  }).join('');
  const bytes = new TextEncoder().encode(jsonSafe);
  if (bytes.byteLength <= MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES) {
    return jsonSafe;
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (
    let end = MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES;
    end > MAX_MANAGED_ASSET_IMPORT_FAILURE_MESSAGE_BYTES - 4;
    end -= 1
  ) {
    try {
      return decoder.decode(bytes.slice(0, end));
    } catch {
      // Back up to the previous complete UTF-8 code point.
    }
  }
  return '';
}
