const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { plannedFiles } = require('../generate-docs-inventory');

const DOCS_PATH = 'apps/docs/reference/repository/versions.mdx';
const TRUSTED_PATHS = [
  'scripts/generate-docs-inventory.js',
  'scripts/paused-runtimes.js',
  'release-please-config.json',
];
const git = (root, args, encoding = 'utf8') =>
  execFileSync('git', args, {
    cwd: root,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });

function expectedVersions(root) {
  const files = plannedFiles(root);
  const expected = files.get('reference/repository/versions.mdx');
  if (typeof expected !== 'string')
    throw new Error('Missing versions projection');
  for (const [file, bytes] of files) {
    if (file === 'reference/repository/versions.mdx') continue;
    const target =
      file === '../docs.json'
        ? path.join(root, 'apps/docs/docs.json')
        : path.join(root, 'apps/docs', file);
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bytes)
      throw new Error(`Unrelated documentation inventory is stale: ${file}`);
  }
  return expected;
}

function refreshVersions(root, { before } = {}) {
  const expected = expectedVersions(root);
  const target = path.join(root, DOCS_PATH);
  const current = fs.readFileSync(target, 'utf8');
  if (before !== undefined && current !== before && current !== expected)
    throw new Error('Changed versions page is not verified derived output');
  if (current === expected) return false;
  fs.writeFileSync(target, expected);
  return true;
}

function resolveProof(root, base, head) {
  const baseSha = git(root, [
    'rev-parse',
    '--verify',
    `${base}^{commit}`,
  ]).trim();
  const headSha = git(root, [
    'rev-parse',
    '--verify',
    `${head}^{commit}`,
  ]).trim();
  if (![baseSha, headSha].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new Error('Immutable release refs required');
  const allowed =
    require('./release-please-auto-approve-core').buildAllowedPaths(
      JSON.parse(git(root, ['show', `${baseSha}:release-please-config.json`]))
    );
  const changed = git(root, [
    'diff',
    '--name-only',
    '-z',
    `${baseSha}...${headSha}`,
  ])
    .split('\0')
    .filter(Boolean);
  if (
    changed.some(
      (file) => file !== DOCS_PATH && file !== 'bun.lock' && !allowed.has(file)
    )
  )
    throw new Error('Release contains unexpected source changes');
  for (const file of TRUSTED_PATHS) {
    const baseline = git(root, ['show', `${baseSha}:${file}`]);
    if (
      git(root, ['show', `${headSha}:${file}`]) !== baseline ||
      fs.readFileSync(path.join(root, file), 'utf8') !== baseline
    )
      throw new Error(`Untrusted release inventory source: ${file}`);
  }
  return { baseSha, headSha };
}

function inventorySnapshot(root, sha, directory) {
  const explicit = new Set([
    'package.json',
    'bun.lock',
    'apps/docs/docs.json',
    'apps/docs/mintlify-version.json',
    'apps/mobile/pubspec.yaml',
    'apps/mobile/pubspec.lock',
    'apps/discord/pyproject.toml',
    'apps/discord/uv.lock',
    'packages/utils/src/seo-policy.json',
    'packages/utils/src/platform-release.ts',
  ]);
  const files = git(root, ['ls-tree', '-r', '-z', sha])
    .split('\0')
    .filter(Boolean)
    .flatMap((record) => {
      const [metadata, file] = record.split('\t');
      const input =
        explicit.has(file) ||
        /^(?:apps|packages)\/[^/]+\/package\.json$/.test(file) ||
        /^apps\/[^/]+\/next\.config\.ts$/.test(file) ||
        /^apps\/[^/]+\/src\/app\/(?:.*\/)?(?:page|route)\.[jt]sx?$/.test(
          file
        ) ||
        /^apps\/docs\/reference\/repository\/.*\.mdx$/.test(file);
      if (!input) return [];
      if (!/^100(?:644|755) blob /.test(metadata))
        throw new Error(`Non-regular inventory input: ${file}`);
      return [file];
    });
  for (const base of ['apps', 'packages']) {
    const names = git(root, ['ls-tree', '-d', '--name-only', `${sha}:${base}`])
      .trim()
      .split('\n');
    for (const name of names)
      fs.mkdirSync(path.join(directory, base, name), { recursive: true });
  }
  const archive = git(
    root,
    ['archive', '--format=tar', sha, '--', ...files],
    null
  );
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
}

function verifyGitVersions(root, base, head) {
  const { baseSha, headSha } = resolveProof(root, base, head);
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'release-docs-proof-')
  );
  try {
    inventorySnapshot(root, headSha, directory);
    const expected = expectedVersions(directory);
    if (fs.readFileSync(path.join(directory, DOCS_PATH), 'utf8') !== expected)
      throw new Error(
        'Release versions page differs from full generator output'
      );
    return { baseSha, headSha, path: DOCS_PATH };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function refreshGitVersions(root, base, head, previous) {
  const proof = resolveProof(root, base, head);
  let before = git(root, ['show', `${proof.baseSha}:${DOCS_PATH}`]);
  const current = fs.readFileSync(path.join(root, DOCS_PATH), 'utf8');
  if (current !== before && current !== expectedVersions(root)) {
    if (!previous || !/^[a-f0-9]{40}$/.test(previous))
      throw new Error('Missing immutable previous release docs proof');
    verifyGitVersions(root, proof.baseSha, previous);
    before = git(root, ['show', `${previous}:${DOCS_PATH}`]);
    if (current !== before)
      throw new Error('Previous release docs bytes differ');
  }
  return refreshVersions(root, { before });
}

if (require.main === module) {
  const [mode, base, head = 'HEAD', previous] = process.argv.slice(2);
  const root = process.cwd();
  if (mode === '--integration' && !base) refreshVersions(root);
  else if (mode === '--refresh' && base)
    refreshGitVersions(root, base, head, previous);
  else if (mode === '--verify' && base) verifyGitVersions(root, base, head);
  else
    throw new Error(
      'Usage: release-docs-inventory.js --refresh|--verify BASE [HEAD] or --integration'
    );
}
module.exports = {
  DOCS_PATH,
  expectedVersions,
  refreshVersions,
  refreshGitVersions,
  verifyGitVersions,
  resolveProof,
};
