// Optional tsrs shadow diagnostics for the changed-files gate. The default
// uses tsc only, and explicit tsrs runs always retain tsc confirmation.

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
  allowNetwork = true,
} = {}) {
  if (env.TSRS_BIN) return exists(env.TSRS_BIN) ? env.TSRS_BIN : null;
  if (!allowNetwork) return null;
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
        env: { ...env, npm_config_ignore_scripts: 'true' },
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

// Auto stays on tsc until seeded-error qualification exists. Explicit tsrs
// runs are advisory and always followed by the authoritative tsc result.
function prefersTsrs(mode) {
  return mode === 'tsrs';
}

module.exports = {
  CHECKERS,
  TSRS_PROJECTS,
  prefersTsrs,
  resolveTsrs,
};
