const MIB = 1024 * 1024;

export const DEFAULT_FETCH_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_ARCHIVE_DOWNLOAD_BYTES = 100 * MIB;
export const DEFAULT_MAX_ARCHIVE_ENTRIES = 2000;
export const DEFAULT_MAX_EXTRACTED_ENTRY_BYTES = 50 * MIB;
export const DEFAULT_MAX_TOTAL_EXTRACTED_BYTES = 250 * MIB;

export function parseIntegerLimitEnv(env, name, fallback) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function parseByteLimitEnv(env, name, fallback) {
  return parseIntegerLimitEnv(env, name, fallback);
}

export function resolveUnzipProxyLimits(env = process.env) {
  return {
    fetchTimeoutMs: parseIntegerLimitEnv(
      env,
      'DRIVE_UNZIP_PROXY_FETCH_TIMEOUT_MS',
      DEFAULT_FETCH_TIMEOUT_MS
    ),
    maxArchiveDownloadBytes: parseByteLimitEnv(
      env,
      'DRIVE_UNZIP_PROXY_MAX_ARCHIVE_BYTES',
      DEFAULT_MAX_ARCHIVE_DOWNLOAD_BYTES
    ),
    maxArchiveEntries: parseIntegerLimitEnv(
      env,
      'DRIVE_UNZIP_PROXY_MAX_ARCHIVE_ENTRIES',
      DEFAULT_MAX_ARCHIVE_ENTRIES
    ),
    maxExtractedEntryBytes: parseByteLimitEnv(
      env,
      'DRIVE_UNZIP_PROXY_MAX_ENTRY_BYTES',
      DEFAULT_MAX_EXTRACTED_ENTRY_BYTES
    ),
    maxTotalExtractedBytes: parseByteLimitEnv(
      env,
      'DRIVE_UNZIP_PROXY_MAX_TOTAL_EXTRACTED_BYTES',
      DEFAULT_MAX_TOTAL_EXTRACTED_BYTES
    ),
  };
}
