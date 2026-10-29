const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const BASELINE = 'scripts/ci/sql-grant-guard-legacy.json';
const digest = (text) => createHash('sha256').update(text).digest('hex');
function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
  });
  return {
    ok: result.status === 0 && !result.error,
    text: result.stdout?.trim() ?? '',
    error: result.error?.message || result.stderr,
  };
}
function required(root, args) {
  const result = git(root, args);
  if (!result.ok)
    throw new Error(`SQL grant guard: git ${args[0]} failed: ${result.error}`);
  return result.text;
}
function resolveBase(root, env = process.env) {
  const branch = env.GITHUB_BASE_REF || 'main';
  required(root, ['check-ref-format', `refs/heads/${branch}`]);
  const ref = `refs/remotes/origin/${branch}`;
  const fetch = (extra) =>
    required(root, [
      'fetch',
      '--no-tags',
      '--quiet',
      ...extra,
      'origin',
      `+refs/heads/${branch}:${ref}`,
    ]);
  if (env.CI || env.GITHUB_BASE_REF) fetch(['--depth=2']);
  else if (!git(root, ['rev-parse', '--verify', ref]).ok) fetch([]);
  for (let attempt = 0; attempt <= 5; attempt++) {
    const base = git(root, ['merge-base', 'HEAD', ref]);
    if (base.ok) return base.text;
    if (required(root, ['rev-parse', '--is-shallow-repository']) !== 'true')
      break;
    fetch(attempt < 4 ? ['--deepen=100'] : ['--unshallow']);
  }
  throw new Error(
    `SQL grant guard: cannot resolve merge-base with ${ref}; refusing to skip SQL checks`
  );
}
function validateBaseline(current, previous) {
  if (!current || Array.isArray(current) || typeof current !== 'object')
    throw new Error('Invalid SQL legacy baseline');
  for (const [file, hash] of Object.entries(current)) {
    if (
      !/^apps\/database\/(?:supabase\/migrations|rollbacks)\/[^/]+\.sql$/.test(
        file
      ) ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error(`Invalid baseline entry: ${file}`);
    if (previous && previous[file] !== hash)
      throw new Error(`SQL legacy baseline is shrink-only: ${file}`);
  }
}
function loadBaseline(root, base) {
  const current = JSON.parse(
    fs.readFileSync(path.join(root, BASELINE), 'utf8')
  );
  const prior = git(root, ['show', `${base}:${BASELINE}`]);
  validateBaseline(current, prior.ok ? JSON.parse(prior.text) : null);
  if (!prior.ok) {
    // Bootstrap only pre-cutoff bytes already present on the independently reviewed base.
    const directories = [
      'apps/database/supabase/migrations',
      'apps/database/rollbacks',
    ];
    const baseFiles = new Set(
      required(root, [
        'ls-tree',
        '-r',
        '--name-only',
        base,
        '--',
        ...directories,
      ]).split('\n')
    );
    const changed = new Set(
      required(root, ['diff', '--name-only', base, '--', ...directories]).split(
        '\n'
      )
    );
    for (const [file, hash] of Object.entries(current)) {
      const version = /\/(\d{14})_/.exec(file)?.[1];
      if (
        !version ||
        version >= '20261028000000' ||
        !baseFiles.has(file) ||
        changed.has(file) ||
        digest(fs.readFileSync(path.join(root, file))) !== hash
      )
        throw new Error(`Unreviewed baseline bootstrap: ${file}`);
    }
  }
  return current;
}
module.exports = {
  BASELINE,
  digest,
  resolveBase,
  loadBaseline,
  validateBaseline,
};
