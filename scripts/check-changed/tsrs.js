// Optional tsrs (Rust TypeScript port) acceleration for the changed-files
// gate. Only projects with recorded diagnostic parity use tsrs, and the runner
// confirms any tsrs failure with tsc, so tsrs alone never blocks a push.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { DEFAULT_PROJECTS, TSRS_VERSION } = require('../ci/tsrs-shadow.js');

const TSRS_PROJECTS = new Set(DEFAULT_PROJECTS);
const CHECKERS = new Set(['auto', 'tsc', 'tsrs']);

/**
 * Locate the pinned tsrs binary: an explicit TSRS_BIN, otherwise the npm exec
 * cache for the exact version (downloaded once, never added to bun.lock).
 */
function resolveTsrs({
  env = process.env,
  execFile = execFileSync,
  exists = fs.existsSync,
} = {}) {
  if (env.TSRS_BIN) return exists(env.TSRS_BIN) ? env.TSRS_BIN : null;
  try {
    const output = execFile(
      'npm',
      [
        'exec',
        '--yes',
        `--package=tsrs@${TSRS_VERSION}`,
        '--',
        'sh',
        '-c',
        'command -v tsrs',
      ],
      {
        // npm cannot parse Bun `catalog:` manifests, so resolve outside the repo.
        cwd: os.tmpdir(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 120_000,
      }
    );
    const binary = output.trim().split(/\r?\n/).at(-1);
    return binary && exists(binary) ? binary : null;
  } catch {
    return null;
  }
}

// `auto` uses tsrs only for parity-qualified projects; `tsrs` forces it for
// every project (still confirmed by tsc on failure); `tsc` disables it.
function prefersTsrs(mode, project) {
  if (mode === 'tsrs') return true;
  return mode === 'auto' && TSRS_PROJECTS.has(project);
}

module.exports = {
  CHECKERS,
  TSRS_PROJECTS,
  prefersTsrs,
  resolveTsrs,
};
