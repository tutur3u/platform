import { constants } from 'node:fs';
import fs from 'node:fs/promises';

const statuses = new Set([
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
]);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Keep only caller-owned fixed titles and status enums, never report errors or attachments.
export function summarizeBrowserResults(report, titles) {
  if (!record(report) || !Array.isArray(report.suites)) return [];
  const found = new Map();
  const pending = [...report.suites];
  let visited = 0;
  while (pending.length) {
    if (++visited > 200) return [];
    const suite = pending.pop();
    if (!record(suite)) return [];
    if (suite.suites !== undefined && !Array.isArray(suite.suites)) return [];
    if (suite.specs !== undefined && !Array.isArray(suite.specs)) return [];
    for (const child of suite.suites ?? []) pending.push(child);
    for (const spec of suite.specs ?? []) {
      if (++visited > 200 || !record(spec)) return [];
      if (!titles.includes(spec.title)) continue;
      if (
        found.has(spec.title) ||
        !Array.isArray(spec.tests) ||
        spec.tests.length !== 1
      )
        return [];
      const results = spec.tests[0]?.results;
      if (
        !Array.isArray(results) ||
        results.length !== 1 ||
        !statuses.has(results[0]?.status)
      )
        return [];
      found.set(spec.title, results[0].status);
    }
  }
  return titles
    .filter((title) => found.has(title))
    .map((title) => ({ title, status: found.get(title) }));
}

export async function readBrowserResultSummary(filename, titles) {
  let file;
  try {
    file = await fs.open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid() ||
      stat.size > 2 * 1024 * 1024
    )
      return [];
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) return [];
    return summarizeBrowserResults(JSON.parse(buffer.toString('utf8')), titles);
  } catch {
    return [];
  } finally {
    await file?.close().catch(() => {});
  }
}
