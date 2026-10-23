// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: CI checkout shape detection, not a Turbo task input.
// Rejects new Wrangler usage. The default Worker toolchain is cf + Void (Vite+);
// Wrangler survives only for allowlisted files tied to a recorded gap with an
// owner and a removal condition. The allowlist is an exact ratchet on two
// counts per file (lines mentioning Wrangler, and executable uses: CLI
// subcommands, imports, dependencies, configs). Counts may only fall, and a
// stale count must be lowered in the same change.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const {
  ALLOWLIST_PATH,
  REPO_ROOT,
  classify,
  countWranglerLines,
  countWranglerUsage,
  isScanned,
  readAllowlist,
  scanWranglerUsage,
} = require('./wrangler-usage.js');

const allowlist = readAllowlist();

function baseAllowlist() {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  // CI checks out fetch-depth 2: on a pull_request merge ref HEAD^1 is the PR
  // base, and on a push it is the previous commit of the pushed branch. A
  // missing parent in CI must fail rather than silently skip the comparison.
  let ref;
  if (process.env.GITHUB_ACTIONS) {
    ref = git(['rev-parse', '--verify', 'HEAD^1']);
  } else {
    try {
      ref = git(['merge-base', 'HEAD', 'origin/main']);
    } catch {
      return undefined;
    }
  }
  try {
    return {
      ref,
      allowlist: JSON.parse(git(['show', `${ref}:${ALLOWLIST_PATH}`])),
    };
  } catch {
    // The base predates the allowlist (its first landing).
    return undefined;
  }
}

test('scanner classifies and excludes paths deterministically', () => {
  assert.equal(classify('apps/x/wrangler.jsonc'), 'config');
  assert.equal(classify('apps/x/wrangler.staging.toml'), 'config');
  assert.equal(classify('.github/workflows/x.yaml'), 'workflow');
  assert.equal(classify('apps/x/package.json'), 'manifest');
  assert.equal(classify('apps/x/scripts/run.mjs'), 'script');
  assert.equal(classify('apps/x/src/worker.ts'), 'source');
  for (const excluded of [
    'apps/docs/build/x.mdx',
    'README.md',
    'bun.lock',
    'plugins/tuturuuu/skills/x/references/y.md',
    'apps/x/node_modules/wrangler/index.js',
    ALLOWLIST_PATH,
  ])
    assert.equal(isScanned(excluded), false, excluded);
  assert.equal(isScanned('apps/x/vite.config.ts'), true);
  assert.equal(
    countWranglerLines('wrangler deploy\nok\nWRANGLER_SEND_METRICS'),
    2
  );
  const usage = scanWranglerUsage({
    files: ['a/wrangler.jsonc', 'a/src/x.ts', 'a/README.md'],
    readFile: (file) => (file === 'a/src/x.ts' ? 'clean' : '{}'),
  });
  assert.deepEqual(usage, {
    'a/wrangler.jsonc': { kind: 'config', lines: 1, uses: 1 },
  });
  // Swapping a mention for an invocation changes `uses`, not `lines`.
  for (const [line, uses] of [
    ['// Wrangler never uploaded source maps', 0],
    ['run: bun x --no-install wrangler deploy -c x.json', 1],
    ['npx wrangler tail my-worker', 1],
    ["import { createTestHarness } from 'wrangler';", 1],
    ['    "wrangler": "4.152.0",', 1],
    ['WRANGLER_SEND_METRICS: false', 0],
  ])
    assert.deepEqual(countWranglerUsage(line), { lines: 1, uses }, line);
});

test('allowlist gaps record a reason, owner and removal condition', () => {
  const used = new Set(
    Object.values(allowlist.files).map((entry) => entry.gap)
  );
  for (const [id, gap] of Object.entries(allowlist.gaps)) {
    for (const field of ['reason', 'owner', 'removal'])
      assert.ok(
        typeof gap[field] === 'string' && gap[field].trim().length > 20,
        `gap ${id} needs a descriptive ${field}`
      );
    assert.ok(used.has(id), `gap ${id} is unused; remove it`);
  }
  const paths = Object.keys(allowlist.files);
  assert.deepEqual(paths, [...paths].sort(), 'keep allowlist paths sorted');
  for (const [file, entry] of Object.entries(allowlist.files)) {
    assert.ok(allowlist.gaps[entry.gap], `${file} references unknown gap`);
    assert.ok(Number.isInteger(entry.lines) && entry.lines > 0, file);
    assert.ok(
      Number.isInteger(entry.uses) &&
        entry.uses >= 0 &&
        entry.uses <= entry.lines,
      `${file} needs a uses count no larger than lines`
    );
  }
});

test('no Wrangler usage outside the allowlist, and counts ratchet down', () => {
  const usage = scanWranglerUsage();
  const problems = [];
  for (const [file, found] of Object.entries(usage)) {
    const allowed = allowlist.files[file];
    if (!allowed) {
      problems.push(
        `${file}: new ${found.kind} Wrangler usage (${found.lines} lines, ${found.uses} uses). Use cf + Void (see apps/docs/build/development-tools/cf-cli-wrangler-parity.mdx) or record an admitted gap.`
      );
      continue;
    }
    for (const count of ['lines', 'uses']) {
      if (found[count] > allowed[count])
        problems.push(
          `${file}: Wrangler ${count} grew ${allowed[count]} -> ${found[count]}`
        );
      else if (found[count] < allowed[count])
        problems.push(
          `${file}: Wrangler ${count} fell ${allowed[count]} -> ${found[count]}; lower the allowlist count`
        );
    }
  }
  for (const file of Object.keys(allowlist.files))
    if (!usage[file])
      problems.push(
        `${file}: no Wrangler usage remains; delete its allowlist entry`
      );
  assert.deepEqual(problems, []);
});

test('allowlist only shrinks relative to its base', (t) => {
  const base = baseAllowlist();
  if (!base) {
    t.skip('no base allowlist available in this checkout');
    return;
  }
  const problems = [];
  for (const [file, entry] of Object.entries(allowlist.files)) {
    const previous = base.allowlist.files[file];
    if (!previous && !entry.admitted)
      problems.push(
        `${file}: new allowlist entry needs an "admitted" decision reference`
      );
    // Growth needs a fresh admission, not one inherited from the base entry.
    for (const count of ['lines', 'uses'])
      if (
        previous &&
        entry[count] > (previous[count] ?? 0) &&
        (!entry.admitted || entry.admitted === previous.admitted)
      )
        problems.push(
          `${file}: ${count} allowance grew ${previous[count] ?? 0} -> ${entry[count]} vs ${base.ref}`
        );
  }
  assert.deepEqual(problems, []);
});
