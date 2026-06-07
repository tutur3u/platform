#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_CACHE_PATHS = [
  '.turbo/cache',
  'apps/web/.next',
  'apps/web/.next/dev',
  'apps/web/.next/dev/cache/turbopack',
];
const TRACE_EVENT_NAMES = new Set([
  'compile-path',
  'ensure-page',
  'handle-request',
  'render-path',
  'setup-dev-bundler',
  'start-dev-server',
  'turbopack-compaction',
  'turbopack-persistence',
]);
const SLOW_FILESYSTEM_PATTERN =
  /Slow filesystem detected|benchmark took \d+ms/iu;
const WATCHER_ERROR_PATTERN = /EMFILE|too many open files|Watchpack Error/iu;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)}${units[unitIndex]}`;
}

function getDiskUsageBytes(
  targetPath,
  { execFileSyncImpl = execFileSync, fsImpl = fs } = {}
) {
  if (!fsImpl.existsSync(targetPath)) {
    return { exists: false, bytes: 0 };
  }

  try {
    const output = execFileSyncImpl('du', ['-sk', targetPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const kilobytes = Number.parseInt(output.trim().split(/\s+/u)[0], 10);

    if (Number.isFinite(kilobytes)) {
      return { exists: true, bytes: kilobytes * 1024 };
    }
  } catch {
    // Fall back to stat size below. `du` is faster for large cache trees, but
    // tests and unusual shells may not provide it.
  }

  return { exists: true, bytes: fsImpl.statSync(targetPath).size };
}

function readTextIfExists(filePath, fsImpl = fs) {
  if (!fsImpl.existsSync(filePath)) return '';
  return fsImpl.readFileSync(filePath, 'utf8');
}

function extractSlowFilesystemWarnings(logText) {
  return extractMatchingLogLines(logText, SLOW_FILESYSTEM_PATTERN);
}

function extractWatcherErrors(logText) {
  return extractMatchingLogLines(logText, WATCHER_ERROR_PATTERN);
}

function extractMatchingLogLines(logText, pattern) {
  return logText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => pattern.test(line));
}

function parseTraceEvents(traceText) {
  const events = [];

  for (const line of traceText.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      const lineEvents = Array.isArray(parsed) ? parsed : [parsed];
      events.push(...lineEvents.filter((event) => event?.name));
    } catch {
      // Trace files can be appended while Next is running. Ignore incomplete
      // lines so diagnostics remain useful during active dev sessions.
    }
  }

  return events;
}

function summarizeTraceEvents(events, { limit = 20 } = {}) {
  return events
    .filter((event) => TRACE_EVENT_NAMES.has(event.name))
    .map((event) => ({
      durationMs: Math.round((event.duration ?? 0) / 1000),
      name: event.name,
      tags: event.tags ?? {},
    }))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, limit);
}

function collectWebDevSpeedDiagnostics({
  cachePaths = DEFAULT_CACHE_PATHS,
  execFileSyncImpl = execFileSync,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  traceLimit = 20,
} = {}) {
  const resolveRoot = (relativePath) => path.join(rootDir, relativePath);
  const cacheSummaries = cachePaths.map((relativePath) => ({
    path: relativePath,
    ...getDiskUsageBytes(resolveRoot(relativePath), {
      execFileSyncImpl,
      fsImpl,
    }),
  }));
  const devDir = resolveRoot(path.join('apps', 'web', '.next', 'dev'));
  const logText = readTextIfExists(
    path.join(devDir, 'logs', 'next-development.log'),
    fsImpl
  );
  const traceText = readTextIfExists(path.join(devDir, 'trace'), fsImpl);

  return {
    cacheSummaries,
    slowFilesystemWarnings: extractSlowFilesystemWarnings(logText),
    traceSpans: summarizeTraceEvents(parseTraceEvents(traceText), {
      limit: traceLimit,
    }),
    watcherErrors: extractWatcherErrors(logText),
  };
}

function formatDiagnosticsReport(diagnostics) {
  const lines = ['Web dev speed diagnostics', ''];

  lines.push('Cache paths:');
  for (const summary of diagnostics.cacheSummaries) {
    lines.push(
      `- ${summary.path}: ${
        summary.exists ? formatBytes(summary.bytes) : 'missing'
      }`
    );
  }

  lines.push('', 'Slow filesystem warnings:');
  if (diagnostics.slowFilesystemWarnings.length === 0) {
    lines.push('- none');
  } else {
    for (const warning of diagnostics.slowFilesystemWarnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('', 'Watcher errors:');
  if ((diagnostics.watcherErrors ?? []).length === 0) {
    lines.push('- none');
  } else {
    for (const error of diagnostics.watcherErrors) {
      lines.push(`- ${error}`);
    }
  }

  lines.push('', 'Top trace spans:');
  if (diagnostics.traceSpans.length === 0) {
    lines.push('- none');
  } else {
    for (const span of diagnostics.traceSpans) {
      lines.push(
        `- ${span.durationMs}ms ${span.name} ${JSON.stringify(span.tags)}`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  process.stdout.write(
    formatDiagnosticsReport(collectWebDevSpeedDiagnostics())
  );
}

module.exports = {
  collectWebDevSpeedDiagnostics,
  extractSlowFilesystemWarnings,
  extractWatcherErrors,
  formatBytes,
  formatDiagnosticsReport,
  parseTraceEvents,
  summarizeTraceEvents,
};
