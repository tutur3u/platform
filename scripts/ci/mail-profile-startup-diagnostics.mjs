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
    'unsupported-cli-option',
    /\bERR_PARSE_ARGS_UNKNOWN_OPTION\b|(?:unknown|unrecognized) (?:option|argument)\b/iu,
  ],
  [
    'next-config-load',
    /Failed to load next\.config\.(?:js|mjs|ts)|Invalid next\.config\.(?:js|mjs|ts) options detected/u,
  ],
  [
    'module-export-contract',
    /\b(?:ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_REQUIRE_ESM|ERR_UNSUPPORTED_DIR_IMPORT)\b|does not provide an export named/u,
  ],
  ['node-option-rejected', /bad option:|is not allowed in NODE_OPTIONS/u],
  ['runtime-syntax', /\bSyntaxError:/u],
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

const readStages = new Set([
  'profile actor',
  'profile bindings',
  'profile creator',
  'profile worlds',
  'layout session',
  'layout workspace',
  'layout invitation',
  'layout workspaces',
  'layout navigation',
]);
const eventLimit = 256;

// Aggregate observations only: concurrent reads have no request correlation.
export function readStageObservations(text, tailTruncated = false) {
  const inputTruncated = tailTruncated || text.length > limit;
  const lines = text.slice(-limit).split(/\r?\n/u);
  if (inputTruncated) lines.shift();
  const stages = new Map();
  let events = 0;
  let eventsTruncated = false;
  for (const line of lines) {
    const match = line.match(
      /^\[lettin-read\] ([a-z ]+) (started|completed|failed)(?: \{ elapsedMs: \d{1,12} \})?$/u
    );
    if (!match || !readStages.has(match[1])) continue;
    if (events === eventLimit) {
      eventsTruncated = true;
      break;
    }
    const [, stage, status] = match;
    const counts = stages.get(stage) ?? {
      stage,
      started: 0,
      completed: 0,
      failed: 0,
      lastStatus: status,
    };
    counts[status] += 1;
    counts.lastStatus = status;
    stages.set(stage, counts);
    events += 1;
  }
  return {
    events,
    eventLimit,
    tailTruncated: inputTruncated,
    eventsTruncated,
    truncated: inputTruncated || eventsTruncated,
    requestAttribution: 'unavailable',
    stages: [...stages.values()],
  };
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
        const text = buffer.subarray(0, bytesRead).toString('utf8');
        record.categories = startupCategories(text);
        if (app === 'lettin') {
          record.readStages = readStageObservations(text, record.truncated);
        }
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
