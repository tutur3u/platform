const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const generatorPath = path.join(
  repoRoot,
  'scripts',
  'ci',
  'generate-build-metadata.ts'
);
const metadataPath = path.join(
  'packages',
  'utils',
  'src',
  'generated',
  'platform-build-metadata.ts'
);

function git(cwd, args, env = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim();
}

function createGitFixture() {
  const cwd = fs.mkdtempSync(
    path.join(os.tmpdir(), 'platform-build-metadata-')
  );
  const commitDate = '2026-06-01T12:34:56Z';

  git(cwd, ['init', '--quiet']);
  git(cwd, ['config', 'user.email', 'ci@example.com']);
  git(cwd, ['config', 'user.name', 'CI']);
  fs.writeFileSync(path.join(cwd, 'fixture.txt'), 'stable input\n');
  git(cwd, ['add', 'fixture.txt']);
  git(cwd, ['commit', '--quiet', '-m', 'feat: deterministic metadata'], {
    GIT_AUTHOR_DATE: commitDate,
    GIT_COMMITTER_DATE: commitDate,
  });

  return cwd;
}

function runGenerator(cwd, env = {}) {
  execFileSync('bun', ['run', '--silent', generatorPath], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REF_NAME: '',
      GITHUB_SHA: '',
      PLATFORM_BUILD_BUILT_AT: '',
      PLATFORM_BUILD_COMMIT_HASH: '',
      PLATFORM_BUILD_COMMIT_MESSAGE: '',
      PLATFORM_BUILD_ENVIRONMENT: '',
      PLATFORM_BUILD_REF_NAME: '',
      SOURCE_DATE_EPOCH: '',
      VERCEL_ENV: '',
      VERCEL_GIT_COMMIT_MESSAGE: '',
      VERCEL_GIT_COMMIT_REF: '',
      VERCEL_GIT_COMMIT_SHA: '',
      ...env,
    },
  });

  return fs.readFileSync(path.join(cwd, metadataPath), 'utf8');
}

function parseGeneratedMetadata(source) {
  const assignment = source.match(/= (\{[\s\S]*\});\n$/u);
  assert.ok(assignment, 'expected generated metadata assignment');
  return JSON.parse(assignment[1]);
}

test('metadata is reproducible and trusts checked-out HEAD over CI commit values', () => {
  const cwd = createGitFixture();
  const expectedHash = git(cwd, ['rev-parse', 'HEAD']);
  const env = {
    GITHUB_REF_NAME: 'untrusted-event-ref',
    GITHUB_SHA: '0000000000000000000000000000000000000000',
    PLATFORM_BUILD_BUILT_AT: '2030-01-01T00:00:00Z',
    PLATFORM_BUILD_COMMIT_HASH: 'explicit-but-not-checked-out',
    PLATFORM_BUILD_COMMIT_MESSAGE: 'Untrusted event message',
    PLATFORM_BUILD_ENVIRONMENT: 'preview',
    PLATFORM_BUILD_REF_NAME: 'feature/cache-foundation',
    VERCEL_GIT_COMMIT_MESSAGE: 'Another untrusted message',
    VERCEL_GIT_COMMIT_SHA: 'ffffffffffffffffffffffffffffffffffffffff',
  };

  const first = runGenerator(cwd, env);
  const second = runGenerator(cwd, env);
  const metadata = parseGeneratedMetadata(first);

  assert.equal(second, first);
  assert.equal(metadata.builtAt, '2026-06-01T12:34:56.000Z');
  assert.equal(metadata.commitHash, expectedHash);
  assert.equal(metadata.commitMessage, 'feat: deterministic metadata');
  assert.equal(metadata.environment, 'preview');
  assert.equal(metadata.refName, 'feature/cache-foundation');
});

test('metadata has deterministic explicit fallbacks outside a Git checkout', () => {
  const cwd = fs.mkdtempSync(
    path.join(os.tmpdir(), 'platform-build-metadata-no-git-')
  );
  const source = runGenerator(cwd, {
    PLATFORM_BUILD_COMMIT_HASH: 'explicit-commit',
    PLATFORM_BUILD_COMMIT_MESSAGE: 'Explicit source metadata',
    PLATFORM_BUILD_ENVIRONMENT: 'production',
    PLATFORM_BUILD_REF_NAME: 'production',
    SOURCE_DATE_EPOCH: '1780317296',
  });
  const metadata = parseGeneratedMetadata(source);

  assert.equal(metadata.builtAt, '2026-06-01T12:34:56.000Z');
  assert.equal(metadata.commitHash, 'explicit-commit');
  assert.equal(metadata.commitMessage, 'Explicit source metadata');
  assert.equal(metadata.environment, 'production');
  assert.equal(metadata.refName, 'production');
});
