// A staging run for an older main SHA can execute after a descendant already
// applied newer migrations. `supabase db push` refuses remote-only versions,
// so without a guard that SHA would get no staging marker and its production
// migration would fail with marker-missing. The real "Deploy migrations to
// staging" step runs here against a stub supabase CLI and a throwaway repo.
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

function deployScript() {
  const lines = fs
    .readFileSync(
      path.resolve(__dirname, '../../.github/workflows/supabase-staging.yaml'),
      'utf8'
    )
    .split('\n');
  const name = lines.indexOf('      - name: Deploy migrations to staging');
  const start = lines.indexOf('        run: |', name);
  assert.ok(name > 0 && start > name, 'deploy step not found');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

const migration = (version) => `${version}_synthetic.sql`;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

// main has `mainVersions`; the checked-out SHA has `localVersions`; staging has
// applied `remoteVersions`.
function run(
  t,
  { listFails = false, localVersions, mainVersions, remoteVersions }
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-marker-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const repo = path.join(root, 'repo');
  const migrations = path.join(repo, 'apps/database/supabase/migrations');
  fs.mkdirSync(migrations, { recursive: true });
  git(repo, 'init', '--quiet', '--initial-branch=work');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'Staging Marker Test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  for (const version of mainVersions) {
    fs.writeFileSync(path.join(migrations, migration(version)), '-- main\n');
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '--no-verify', '-m', 'main');
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  for (const file of fs.readdirSync(migrations)) {
    fs.rmSync(path.join(migrations, file));
  }
  for (const version of localVersions) {
    fs.writeFileSync(path.join(migrations, migration(version)), '-- local\n');
  }

  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const pushLog = path.join(root, 'pushes');
  fs.writeFileSync(
    path.join(bin, 'supabase'),
    `#!/bin/sh
case "$1 $2" in
  "link --project-ref") exit 0 ;;
  "migration list")
    [ "$FAKE_LIST_FAILS" = true ] && exit 1
    printf '\\n   Local          | Remote         | Time (UTC)\\n  ----------------|----------------|---------------------\\n'
    for version in $FAKE_REMOTE; do
      printf '   %s | %s | 2026-01-01 00:00:00\\n' "$version" "$version"
    done ;;
  "db push") echo pushed >> "$PUSH_LOG" ;;
  *) exit 9 ;;
esac
`,
    { mode: 0o755 }
  );
  const summary = path.join(root, 'summary.md');
  const result = spawnSync('bash', ['-c', deployScript()], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      FAKE_LIST_FAILS: String(listFails),
      FAKE_REMOTE: remoteVersions.join(' '),
      GITHUB_STEP_SUMMARY: summary,
      HOME: process.env.HOME,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      PUSH_LOG: pushLog,
      STAGING_PROJECT_ID: 'synthetic-project',
    },
  });
  return {
    output: result.stdout + result.stderr,
    pushed: fs.existsSync(pushLog),
    status: result.status,
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
  };
}

const v = (n) => `2026010100000${n}`;

test('staging ahead with nothing new records the marker without pushing', (t) => {
  const result = run(t, {
    localVersions: [v(1), v(2)],
    mainVersions: [v(1), v(2), v(3)],
    remoteVersions: [v(1), v(2), v(3)],
  });
  assert.equal(result.status, 0, result.output);
  assert.equal(result.pushed, false);
  assert.match(result.output, /Already applied by a descendant/u);
  assert.match(result.summary, /Already applied by a descendant/u);
});

test('new local versions are pushed as before', (t) => {
  for (const remoteVersions of [[v(1), v(2)], []]) {
    const result = run(t, {
      localVersions: [v(1), v(2), v(4)],
      mainVersions: [v(1), v(2), v(4)],
      remoteVersions,
    });
    assert.equal(result.status, 0, result.output);
    assert.equal(result.pushed, true);
  }
  // Nothing new on either side: the ordinary (no-op) push still runs.
  const same = run(t, {
    localVersions: [v(1), v(2)],
    mainVersions: [v(1), v(2)],
    remoteVersions: [v(1), v(2)],
  });
  assert.equal(same.pushed, true);
});

test('a remote-only version that is not on main fails closed', (t) => {
  const result = run(t, {
    localVersions: [v(1), v(2)],
    mainVersions: [v(1), v(2), v(3)],
    remoteVersions: [v(1), v(2), v(9)],
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.pushed, false);
  assert.match(result.output, /not on main; refusing to migrate or mark/u);
});

test('an unreadable migration list falls back to the ordinary push', (t) => {
  const result = run(t, {
    listFails: true,
    localVersions: [v(1), v(2)],
    mainVersions: [v(1), v(2), v(3)],
    remoteVersions: [v(1), v(2), v(3)],
  });
  assert.equal(result.status, 0, result.output);
  assert.equal(result.pushed, true);
});
