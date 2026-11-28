// Entry-point detection for Performance Factory CLIs.
//
// Node resolves symlinks for the entry module's `import.meta.url`, but
// `process.argv[1]` keeps the path it was launched with. A script staged into a
// symlinked directory (macOS `mktemp` returns `/var/folders/...`, which is
// `/private/var/folders/...`) therefore never equals its own `import.meta.url`
// when compared as raw strings, and a `main()` guard silently skips the CLI and
// exits 0 with no output. Compare canonical (realpath) paths instead.

import { realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function canonical(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Classifies how this module was loaded:
 * - `entry`: launched directly (`node <file>`), including through a symlink or
 *   a staged copy.
 * - `misrouted`: argv[1] names this file but does not resolve to it, so a
 *   main-guard would skip `main()`. Callers must fail loudly.
 * - `imported`: loaded by another module or test runner.
 */
export function entryStatus(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return 'imported';
  const self = fileURLToPath(metaUrl);
  if (canonical(argv1) === canonical(self)) return 'entry';
  return basename(argv1) === basename(self) ? 'misrouted' : 'imported';
}

export function isEntryPoint(metaUrl, argv1 = process.argv[1]) {
  return entryStatus(metaUrl, argv1) === 'entry';
}

/**
 * Call from the `else` branch of an entry guard. When the module was launched
 * by its own name but the guard skipped `main()`, log a stderr warning without
 * mutating `process.exitCode` (so a legitimate same-basename importer is not
 * broken). Returns true when it warned.
 */
export function failIfMisrouted(metaUrl, argv1 = process.argv[1]) {
  if (entryStatus(metaUrl, argv1) !== 'misrouted') return false;
  console.error(
    `WARNING: entry guard skipped main for ${argv1}; continuing without running CLI`
  );
  return true;
}
