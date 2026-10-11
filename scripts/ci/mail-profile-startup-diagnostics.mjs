import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const limit = 128 * 1024;
const categories = [
  ['storage-quota', /\b(?:EDQUOT|ENOSPC)\b/u],
  ['permission-denied', /\bEACCES\b/u],
  ['address-in-use', /\bEADDRINUSE\b/u],
  [
    'missing-module',
    /\b(?:MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)\b|Cannot find module|Module not found/u,
  ],
  [
    'cache-components-config',
    /Route segment config.*(?:dynamic|revalidate).*cacheComponents/u,
  ],
];

// Return only fixed categories. No log lines, paths, credentials, or bodies leave here.
export function startupCategories(text) {
  return categories
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

export async function privateStartupDiagnostics(reports, children) {
  const records = [];
  for (const app of ['web', 'lettin']) {
    const child = children.find((entry) => entry.profileApp === app);
    const record = {
      app,
      started: Boolean(child),
      postCleanupExitCode: Number.isInteger(child?.exitCode)
        ? child.exitCode
        : null,
      postCleanupSignaled: Boolean(child?.signalCode),
    };
    let file;
    try {
      file = await fs.open(
        path.join(reports, `${app}-private.log`),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.uid !== process.getuid() ||
        stat.mode & 0o077
      ) {
        record.logRead = 'unsafe-file-retained';
      } else {
        const buffer = Buffer.alloc(Math.min(stat.size, limit));
        const { bytesRead } = await file.read(
          buffer,
          0,
          buffer.length,
          Math.max(0, stat.size - limit)
        );
        record.logRead = 'bounded-private-tail';
        record.logBytes = stat.size;
        record.inspectedBytes = bytesRead;
        record.truncated = stat.size > bytesRead;
        record.categories = startupCategories(
          buffer.subarray(0, bytesRead).toString('utf8')
        );
        record.causeProven = false;
      }
    } catch (error) {
      record.logRead =
        error?.code === 'ENOENT' ? 'not-created' : 'private-read-failed';
    } finally {
      await file?.close().catch(() => {});
    }
    records.push(record);
  }
  return records;
}

// Preserve only the existing fixed safe reason before lifecycle wrappers consume errors.
export function observeFixtureFailure(operation, classify, record) {
  return async (...args) => {
    try {
      return await operation(...args);
    } catch (error) {
      record(classify(error));
      throw error;
    }
  };
}

export function safeFixtureFailure(error) {
  const message = error instanceof Error ? error.message : '';
  if (/^Owned command failed \((?:\d+|SIG[A-Z]+)\)$/u.test(message))
    return 'owned-command-exit';
  const reasons = new Map([
    ['Owned command exceeded its deadline', 'owned-command-deadline'],
    ['Owned app readiness deadline exceeded', 'app-readiness-deadline'],
    ['Owned web app exited before readiness', 'web-app-before-readiness'],
    ['Owned lettin app exited before readiness', 'lettin-app-before-readiness'],
    ['Full fixture or scoped Supabase stop failed', 'fixture-or-stop-failed'],
    ['Owned cleanup failed', 'owned-cleanup-failed'],
    ['Preflight and receipt failed', 'preflight-receipt-failed'],
  ]);
  return reasons.get(message) ?? 'unclassified-fixture-failure';
}
