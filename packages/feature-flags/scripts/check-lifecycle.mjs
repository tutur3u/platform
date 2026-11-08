#!/usr/bin/env node
// Reports invalid catalog metadata and flags past their removal deadline.
// Default mode only warns; --strict exits 1 when anything is reported.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findOverdueFlags, validateCatalog } from '../src/lifecycle.mjs';

const DEFAULT_CATALOG = fileURLToPath(
  new URL('../../../config/feature-flag-catalog.json', import.meta.url)
);

function parseArgs(argv) {
  const options = { catalog: DEFAULT_CATALOG, now: new Date(), strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') options.strict = true;
    else if (arg === '--catalog') options.catalog = argv[++index];
    else if (arg === '--now') options.now = new Date(argv[++index] ?? '');
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.catalog) throw new Error('--catalog requires a path');
  if (Number.isNaN(options.now.getTime())) {
    throw new Error('--now requires an ISO date');
  }
  return options;
}

function annotation(level, title, message) {
  return `::${level} title=${title}::${message}`;
}

export function runLifecycleCheck(argv, log = console.log) {
  const options = parseArgs(argv);
  const level = options.strict ? 'error' : 'warning';
  const catalog = JSON.parse(readFileSync(options.catalog, 'utf8'));
  const errors = validateCatalog(catalog);
  for (const error of errors) {
    log(annotation(level, 'Feature flag metadata', error));
  }
  const overdue =
    errors.length === 0 ? findOverdueFlags(catalog, options.now) : [];
  for (const { flag, lifecycle } of overdue) {
    log(
      annotation(
        level,
        'Feature flag overdue',
        `${flag.key} (${flag.family}) was due for removal at ${lifecycle.removeBy}`
      )
    );
  }
  const reported = errors.length + overdue.length;
  log(
    `Feature flag lifecycle: ${catalog.flags?.length ?? 0} flags, ${errors.length} metadata issues, ${overdue.length} overdue.`
  );
  return options.strict && reported > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runLifecycleCheck(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
