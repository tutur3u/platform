const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
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
function baselineReference(root, base, env = process.env) {
  if (required(root, ['rev-parse', 'HEAD']) !== base) return base;
  // On main compare against the pre-push state, never against the new baseline itself.
  let previous;
  if (env.GITHUB_EVENT_NAME === 'push') {
    if (!env.GITHUB_EVENT_PATH)
      throw new Error('SQL grant guard: push event payload is required');
    previous = JSON.parse(
      fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')
    ).before;
    if (!/^[a-f0-9]{40}$/.test(previous ?? '') || /^0+$/.test(previous))
      throw new Error('SQL grant guard: invalid pre-push SHA');
    if (!git(root, ['cat-file', '-e', `${previous}^{commit}`]).ok)
      required(root, [
        'fetch',
        '--no-tags',
        '--quiet',
        '--depth=1',
        'origin',
        previous,
      ]);
  } else previous = required(root, ['rev-parse', 'HEAD^1']);
  return previous;
}
module.exports = { digest, resolveBase, baselineReference };
