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
const DEFAULT_PROCESS_MATCHERS = [
  'apps/web',
  'next dev -p 7803',
  'next-server',
  '.next/dev',
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
const PROCESS_RSS_WARNING_BYTES = 1024 * 1024 * 1024;
const PROCESS_RSS_CRITICAL_BYTES = 4 * PROCESS_RSS_WARNING_BYTES;
const TURBOPACK_CACHE_WARNING_BYTES = 2 * PROCESS_RSS_WARNING_BYTES;

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

function parseProcessList(output = '') {
  const processes = [];

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u);
    if (!match) continue;

    processes.push({
      command: match[4],
      pid: Number.parseInt(match[1], 10),
      ppid: Number.parseInt(match[2], 10),
      rssBytes: Number.parseInt(match[3], 10) * 1024,
    });
  }

  return processes.filter(
    (processInfo) =>
      Number.isFinite(processInfo.pid) &&
      Number.isFinite(processInfo.ppid) &&
      Number.isFinite(processInfo.rssBytes)
  );
}

function collectMatchingProcessTree(
  processes,
  matchers = DEFAULT_PROCESS_MATCHERS
) {
  const normalizedMatchers = matchers.map((matcher) => matcher.toLowerCase());
  const childrenByPpid = new Map();
  const selectedPids = new Set();

  for (const processInfo of processes) {
    const children = childrenByPpid.get(processInfo.ppid) ?? [];
    children.push(processInfo);
    childrenByPpid.set(processInfo.ppid, children);

    const normalizedCommand = processInfo.command.toLowerCase();
    if (
      normalizedMatchers.some((matcher) => normalizedCommand.includes(matcher))
    ) {
      selectedPids.add(processInfo.pid);
    }
  }

  const queue = [...selectedPids];
  for (let index = 0; index < queue.length; index += 1) {
    const pid = queue[index];
    for (const child of childrenByPpid.get(pid) ?? []) {
      if (selectedPids.has(child.pid)) continue;
      selectedPids.add(child.pid);
      queue.push(child.pid);
    }
  }

  return processes
    .filter((processInfo) => selectedPids.has(processInfo.pid))
    .sort((left, right) => right.rssBytes - left.rssBytes);
}

function collectProcessDiagnostics({
  execFileSyncImpl = execFileSync,
  matchers = DEFAULT_PROCESS_MATCHERS,
} = {}) {
  try {
    const output = execFileSyncImpl(
      'ps',
      ['-axo', 'pid=,ppid=,rss=,command='],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    const processes = collectMatchingProcessTree(
      parseProcessList(output),
      matchers
    );
    const totalRssBytes = processes.reduce(
      (sum, processInfo) => sum + processInfo.rssBytes,
      0
    );

    return {
      available: true,
      processes,
      totalRssBytes,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      processes: [],
      totalRssBytes: 0,
    };
  }
}

function extractDockerBuildMemoryPolicy({
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const dockerfile = readTextIfExists(
    path.join(rootDir, 'apps', 'web', 'Dockerfile'),
    fsImpl
  );
  const packageJsonText = readTextIfExists(
    path.join(rootDir, 'apps', 'web', 'package.json'),
    fsImpl
  );
  let webBuildScript = '';

  if (packageJsonText) {
    try {
      webBuildScript = JSON.parse(packageJsonText).scripts?.build ?? '';
    } catch {
      webBuildScript = '';
    }
  }

  return {
    dockerBuildMemory:
      dockerfile.match(/^ARG\s+DOCKER_WEB_BUILD_MEMORY=(.+)$/mu)?.[1]?.trim() ??
      null,
    dockerNodeMaxOldSpace:
      dockerfile
        .match(/^ARG\s+DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE=(.+)$/mu)?.[1]
        ?.trim() ?? null,
    webBuildMaxOldSpace:
      webBuildScript.match(/--max-old-space-size[=\s]+(\d+)/u)?.[1]?.trim() ??
      null,
  };
}

function findCacheSummary(cacheSummaries, pathName) {
  return cacheSummaries.find((summary) => summary.path === pathName) ?? null;
}

function classifyDiagnostics(diagnostics) {
  const findings = [];
  const processTotal = diagnostics.processDiagnostics?.totalRssBytes ?? 0;
  const turbopackCache =
    findCacheSummary(
      diagnostics.cacheSummaries,
      'apps/web/.next/dev/cache/turbopack'
    )?.bytes ?? 0;
  const nextDevCache =
    findCacheSummary(diagnostics.cacheSummaries, 'apps/web/.next/dev')?.bytes ??
    0;

  if (processTotal >= PROCESS_RSS_CRITICAL_BYTES) {
    findings.push(
      `live web dev process RSS is high (${formatBytes(processTotal)}); inspect heap or active routes before focusing on cache cleanup`
    );
  } else if (processTotal >= PROCESS_RSS_WARNING_BYTES) {
    findings.push(
      `live web dev process RSS is elevated (${formatBytes(processTotal)}); compare this with cache size before changing app structure`
    );
  }

  if (turbopackCache >= TURBOPACK_CACHE_WARNING_BYTES) {
    findings.push(
      `Turbopack dev cache is large (${formatBytes(turbopackCache)}); cache cleanup or import-graph reduction is likely useful`
    );
  } else if (nextDevCache >= TURBOPACK_CACHE_WARNING_BYTES) {
    findings.push(
      `.next/dev is large (${formatBytes(nextDevCache)}); inspect cache contents before treating this as RSS`
    );
  }

  if ((diagnostics.watcherErrors ?? []).length > 0) {
    findings.push(
      'watcher errors are present; fix open-file limits or watcher polling before chasing route-level memory'
    );
  }

  if (
    diagnostics.buildMemoryPolicy?.dockerBuildMemory ||
    diagnostics.buildMemoryPolicy?.webBuildMaxOldSpace
  ) {
    findings.push(
      `build memory policy is configured separately (Docker ${diagnostics.buildMemoryPolicy.dockerBuildMemory ?? 'unknown'}, web build max-old-space ${diagnostics.buildMemoryPolicy.webBuildMaxOldSpace ?? 'default'}); do not compare that budget directly to live dev RSS`
    );
  }

  if (findings.length === 0) {
    findings.push(
      'no dominant pressure detected from cache, RSS, watcher, or build-budget signals in this snapshot'
    );
  }

  return findings;
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

function getLatestDevServerStartTime(events) {
  const startTimes = events
    .filter((event) => event?.name === 'start-dev-server')
    .map((event) => event.startTime)
    .filter((startTime) => Number.isFinite(startTime));

  return startTimes.length > 0 ? Math.max(...startTimes) : null;
}

function getLatestDevServerTraceEvents(events) {
  const latestStartTime = getLatestDevServerStartTime(events);

  if (latestStartTime === null) {
    return events;
  }

  return events.filter((event) => {
    if (!Number.isFinite(event.startTime)) {
      return event.name === 'start-dev-server';
    }

    return event.startTime >= latestStartTime;
  });
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
  const traceEvents = parseTraceEvents(traceText);
  const latestTraceEvents = getLatestDevServerTraceEvents(traceEvents);

  return {
    cacheSummaries,
    slowFilesystemWarnings: extractSlowFilesystemWarnings(logText),
    latestTraceSpans: summarizeTraceEvents(latestTraceEvents, {
      limit: traceLimit,
    }),
    buildMemoryPolicy: extractDockerBuildMemoryPolicy({ fsImpl, rootDir }),
    processDiagnostics: collectProcessDiagnostics({ execFileSyncImpl }),
    traceSpans: summarizeTraceEvents(traceEvents, {
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

  lines.push('', 'Live web dev process RSS:');
  const processDiagnostics = diagnostics.processDiagnostics ?? {
    available: false,
    processes: [],
    totalRssBytes: 0,
  };
  if (!processDiagnostics.available) {
    lines.push(
      `- unavailable${
        processDiagnostics.error ? ` (${processDiagnostics.error})` : ''
      }`
    );
  } else if (processDiagnostics.processes.length === 0) {
    lines.push('- no matching web dev processes found');
  } else {
    lines.push(`- total: ${formatBytes(processDiagnostics.totalRssBytes)}`);
    for (const processInfo of processDiagnostics.processes.slice(0, 12)) {
      lines.push(
        `- ${formatBytes(processInfo.rssBytes)} pid=${processInfo.pid} ppid=${
          processInfo.ppid
        } ${processInfo.command}`
      );
    }
  }

  lines.push('', 'Build memory policy:');
  const buildMemoryPolicy = diagnostics.buildMemoryPolicy ?? {};
  lines.push(
    `- Docker build memory: ${buildMemoryPolicy.dockerBuildMemory ?? 'unknown'}`
  );
  lines.push(
    `- Docker Node max-old-space: ${
      buildMemoryPolicy.dockerNodeMaxOldSpace ?? 'unknown'
    }`
  );
  lines.push(
    `- Web build max-old-space: ${
      buildMemoryPolicy.webBuildMaxOldSpace ?? 'default'
    }`
  );

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

  lines.push('', 'Likely pressure:');
  for (const finding of classifyDiagnostics(diagnostics)) {
    lines.push(`- ${finding}`);
  }

  lines.push('', 'Top trace spans (latest dev server):');
  if ((diagnostics.latestTraceSpans ?? []).length === 0) {
    lines.push('- none');
  } else {
    for (const span of diagnostics.latestTraceSpans) {
      lines.push(
        `- ${span.durationMs}ms ${span.name} ${JSON.stringify(span.tags)}`
      );
    }
  }

  lines.push('', 'Top trace spans (all recorded):');
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
  classifyDiagnostics,
  collectMatchingProcessTree,
  collectProcessDiagnostics,
  extractDockerBuildMemoryPolicy,
  extractSlowFilesystemWarnings,
  extractWatcherErrors,
  formatBytes,
  formatDiagnosticsReport,
  getLatestDevServerStartTime,
  getLatestDevServerTraceEvents,
  parseTraceEvents,
  summarizeTraceEvents,
};
