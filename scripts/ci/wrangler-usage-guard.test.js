// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: CI checkout shape detection, not a Turbo task input.
// Rejects new Wrangler usage. The default Worker toolchain is cf + Void (Vite+);
// Wrangler survives only for allowlisted files tied to a recorded gap with an
// owner and a removal condition. The allowlist is an exact ratchet on two
// counts per file (lines mentioning Wrangler, and conservative token
// occurrences plus configs). Counts may only fall, and a
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
  validateAllowlistTransition,
  usageDigest,
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
    'notes.txt',
    'bun.lock',
    'plugins/tuturuuu/skills/x/references/y.md',
    'apps/x/node_modules/wrangler/index.js',
    ALLOWLIST_PATH,
    'plugins/tuturuuu/assets/light.png',
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
    'a/wrangler.jsonc': {
      kind: 'config',
      lines: 1,
      uses: 1,
      digest: usageDigest('{}', true),
    },
  });
  // Comments and identifiers are deliberately counted conservatively.
  for (const [line, uses] of [
    ['// Wrangler never uploaded source maps', 1],
    ['# wrangler deploy', 1],
    ['/* wrangler deploy */', 1],
    ['run: bun x --no-install wrangler deploy -c x.json', 1],
    ['npx wrangler tail my-worker', 1],
    ["import { createTestHarness } from 'wrangler';", 1],
    ['    "wrangler": "4.152.0",', 1],
    ['WRANGLER_SEND_METRICS: false', 1],
  ])
    assert.deepEqual(countWranglerUsage(line), { lines: 1, uses }, line);
});

test('scanner covers executable paths in plugins, agent skills, tmp and docs', () => {
  const files = [
    'plugins/tuturuuu/scripts/run.py',
    '.agents/skills/example/run.sh',
    'tmp/retained/run.mjs',
    'apps/docs/scripts/run.js',
  ];
  const usage = scanWranglerUsage({
    files: [...files, 'plugins/example/README.md', 'tmp/note.txt'],
    readFile: () => 'wrangler deploy',
  });
  assert.deepEqual(Object.keys(usage), [...files].sort());
  for (const file of files) assert.equal(usage[file].uses, 1, file);
});

test('all command, import, argv and dependency spellings count without subcommands', () => {
  for (const source of [
    'bunx wrangler@4.152.0 deploy',
    'npx wrangler@latest deploy',
    'pnpm dlx wrangler@4.152.0 deploy',
    'wrangler --config worker.jsonc --env staging deploy',
    'wrangler --experimental-new-command',
    "spawn('bun', ['x', '--no-install', 'wrangler', 'deploy']);",
    "const argv = ['wrangler', '--env', 'staging', 'deploy'];",
    'import(`wrangler`)',
    'import(`wrangler/experimental`)',
    '"wrangler": "catalog:"',
    '"wrangler": "workspace:*"',
    '"wrangler": "latest"',
  ]) {
    assert.deepEqual(countWranglerUsage(source), { lines: 1, uses: 1 }, source);
  }
  for (const [source, lines, uses] of [
    ['bunx wrangler \\\n  deploy', 1, 1],
    ['bunx \\\n  wrangler@4.152.0 \\\n  deploy', 1, 1],
    ['node node_modules/wrangler/bin/wrangler.js deploy', 1, 2],
    ["require.resolve('wrangler/bin/wrangler.js')", 1, 2],
    [
      'const script = `\n# wrangler deploy\n// wrangler deploy\n/* wrangler deploy */\n`;',
      3,
      3,
    ],
  ])
    assert.deepEqual(countWranglerUsage(source), { lines, uses }, source);
});

test('existing Meet dry-run and Lettin identity argv uses cannot count as zero', () => {
  const files = [
    'scripts/ci/meet-dry-run-scratch.mjs',
    'apps/lettin/scripts/configure-identity.ts',
  ];
  const usage = scanWranglerUsage({ files });
  for (const file of files) assert.ok(usage[file]?.uses > 0, file);
});

test('multiple invocations on one line cannot hide behind a mention count', () => {
  assert.deepEqual(countWranglerUsage('wrangler deploy && wrangler tail'), {
    lines: 1,
    uses: 2,
  });
  assert.deepEqual(
    countWranglerUsage("import('wrangler'); require('wrangler');"),
    { lines: 1, uses: 2 }
  );
});

test('allowlist gaps record a reason, owner and removal condition', () => {
  assert.deepEqual(validateAllowlistTransition(undefined, allowlist), []);
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
    assert.match(
      entry.digest,
      /^[a-f0-9]{64}$/,
      `${file} needs a SHA-256 digest`
    );
    assert.ok(Number.isInteger(entry.lines) && entry.lines > 0, file);
    assert.ok(
      Number.isInteger(entry.uses) && entry.uses >= 0,
      `${file} needs a nonnegative uses count`
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
    if (found.digest !== allowed.digest)
      problems.push(
        `${file}: Wrangler lines changed; update digest with admission`
      );
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

test('allowlist transitions require structured, fresh admission for expansion or changed gaps', () => {
  const admission = (reason = 'REV-6485-1: reviewed scanner correction') => ({
    decision: 'https://github.com/tutur3u/platform/pull/6485',
    reason,
  });
  const baseline = {
    gaps: { old: { reason: 'old gap' }, other: { reason: 'other gap' } },
    files: {
      'run.js': { lines: 1, uses: 1, gap: 'old', admitted: admission() },
    },
  };
  const copy = () => structuredClone(baseline);
  assert.deepEqual(validateAllowlistTransition(baseline, copy()), []);
  const shrunk = copy();
  shrunk.files['run.js'].uses = 0;
  assert.deepEqual(validateAllowlistTransition(baseline, shrunk), []);
  const removed = copy();
  delete removed.files['run.js'];
  assert.deepEqual(validateAllowlistTransition(baseline, removed), []);

  for (const mutate of [
    (next) => {
      next.files['run.js'].lines += 1;
    },
    (next) => {
      next.files['run.js'].uses += 1;
    },
    (next) => {
      next.files['run.js'].digest = 'new-digest';
    },
    (next) => {
      next.files['run.js'].gap = 'other';
    },
    (next) => {
      next.gaps.old.reason = 'changed scope';
    },
  ]) {
    const next = copy();
    mutate(next);
    // Deserializing or reordering identical objects must not renew admission.
    next.files['run.js'].admitted = {
      reason: baseline.files['run.js'].admitted.reason,
      decision: baseline.files['run.js'].admitted.decision,
    };
    assert.match(
      validateAllowlistTransition(baseline, next).join('\n'),
      /fresh admitted/
    );
    next.files['run.js'].admitted = admission(
      'REV-6485-3: explicit new admission'
    );
    assert.deepEqual(validateAllowlistTransition(baseline, next), []);
  }

  for (const invalid of [
    undefined,
    null,
    'orchestrator approved',
    {},
    [],
    { decision: admission().decision },
    { ...admission(), reason: '  ' },
    { ...admission(), decision: 'https://example.com/6485' },
    { ...admission(), decision: 'https://github.com/other/repo/pull/6485' },
    { ...admission(), decision: 'https://github.com/tutur3u/platform/pull/0' },
    { ...admission(), extra: true },
  ]) {
    const next = copy();
    next.files['new.js'] = { lines: 1, uses: 1, gap: 'old', admitted: invalid };
    assert.match(
      validateAllowlistTransition(baseline, next).join('\n'),
      /new allowlist entry/
    );
    if (invalid !== undefined)
      assert.match(
        validateAllowlistTransition(undefined, next).join('\n'),
        /repository PR/
      );
  }
  const added = copy();
  added.files['new.js'] = {
    lines: 1,
    uses: 1,
    gap: 'old',
    admitted: admission(),
  };
  assert.deepEqual(validateAllowlistTransition(baseline, added), []);
  const grandfathered = copy();
  delete grandfathered.files['run.js'].admitted;
  assert.deepEqual(validateAllowlistTransition(baseline, grandfathered), []);
  grandfathered.files['run.js'].uses += 1;
  assert.match(
    validateAllowlistTransition(baseline, grandfathered).join('\n'),
    /fresh admitted/
  );
});

test('allowlist only shrinks relative to its base', (t) => {
  const base = baseAllowlist();
  if (!base) {
    t.skip('no base allowlist available in this checkout');
    return;
  }
  assert.deepEqual(
    validateAllowlistTransition(base.allowlist, allowlist),
    [],
    base.ref
  );
});

test('same-count comment replacement and changed arguments require admission', () => {
  const comment = '// wrangler is retained';
  const command = 'wrangler deploy --name live';
  assert.deepEqual(countWranglerUsage(comment), countWranglerUsage(command));
  assert.notEqual(usageDigest(comment), usageDigest(command));
  assert.notEqual(
    usageDigest(command),
    usageDigest('wrangler deploy --name other')
  );
});
