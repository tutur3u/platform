// Rejects new Wrangler usage. The default Worker toolchain is cf + Void (Vite+);
// Wrangler survives only for allowlisted files tied to a recorded gap with an
// owner and a removal condition. The allowlist is an exact ratchet on two
// counts per file (lines mentioning Wrangler, and conservative token
// occurrences plus configs). Counts may only fall, and a
// stale count must be lowered in the same change.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');
const {
  ALLOWLIST_PATH,
  REPO_ROOT,
  classify,
  countPublishCalls,
  countWranglerLines,
  countWranglerUsage,
  isScanned,
  readAllowlist,
  scanPublishCalls,
  scanPublishCallsAt,
  scanWranglerUsage,
  validateAllowlistTransition,
  validatePublishTransition,
  usageDigest,
} = require('./wrangler-usage.js');

const allowlist = readAllowlist();

/**
 * The revision this change is compared with: the pushed range's `before`, or
 * the pull request base, when the checkout has it; otherwise `HEAD^1` (the
 * pull request merge ref's base, or the previous pushed commit).
 */
function guardBase(git) {
  let event = {};
  try {
    event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    // Local runs and events without a payload use HEAD^1.
  }
  for (const candidate of [event.before, event.pull_request?.base?.sha]) {
    if (!/^[0-9a-f]{40}$/u.test(candidate ?? '') || /^0+$/u.test(candidate))
      continue;
    try {
      return git(['rev-parse', '--verify', `${candidate}^{commit}`]);
    } catch {
      // Shallow checkouts may not contain it.
    }
  }
  return git(['rev-parse', '--verify', 'HEAD^1']);
}

function baseAllowlist() {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  // CI checks out at least fetch-depth 2. A missing base in CI must fail
  // rather than silently skip the comparison.
  let ref;
  if (process.env.GITHUB_ACTIONS) {
    ref = guardBase(git);
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
  const files = ['scripts/ci/meet-dry-run-scratch.mjs'];
  const usage = scanWranglerUsage({ files });
  for (const file of files) assert.ok(usage[file]?.uses > 0, file);
  // The retired Lettin identity script spawned this exact argv; an argv array
  // must still count as usage after the file itself was removed.
  const lettinIdentityArgv =
    "spawnSync('bun', ['x', '--no-install', 'wrangler', 'secret', 'bulk'], {";
  assert.ok(countWranglerUsage(lettinIdentityArgv).uses > 0);
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
    {
      ...admission(),
      decision: 'https://github.com/tutur3u/platform/commit/c4a91e626f',
    },
    {
      ...admission(),
      decision: `https://github.com/other/repo/commit/${'a'.repeat(40)}`,
    },
    {
      ...admission(),
      decision: `https://github.com/tutur3u/platform/tree/${'a'.repeat(40)}`,
    },
    {
      ...admission(),
      decision: `https://github.com/tutur3u/platform/blob/${'a'.repeat(40)}/run.js`,
    },
    {
      ...admission(),
      decision: `https://github.com/tutur3u/platform/commit/${'A'.repeat(40)}`,
    },
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
  // D353 direct-to-main changes cite the full commit URL instead of a PR.
  const committed = copy();
  committed.files['new.js'] = {
    lines: 1,
    uses: 1,
    gap: 'old',
    admitted: {
      decision:
        'https://github.com/tutur3u/platform/commit/c4a91e626f1cea56b91fce8210e6fdfb1a88d944',
      reason: 'direct-to-main change under D353',
    },
  };
  assert.deepEqual(validateAllowlistTransition(baseline, committed), []);
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

test('publish calls count real writes, not dry runs, reads or local state', () => {
  for (const source of [
    'run: bun x --no-install wrangler deploy -c x.json',
    `run: "wrangler deploy --message 'x --dry-run'"`,
    `bash -c "wrangler deploy --message 'x --dry-run'"`,
    'bunx wrangler@4.152.0 versions upload --message "$SHA"',
    'wrangler --config worker.jsonc --env staging deploy',
    'npx wrangler secret put TOKEN',
    'wrangler versions deploy "$v@100%" --name gw -y',
    'wrangler rollback "$v" --name gw',
    'wrangler d1 migrations apply DB --remote',
    'wrangler triggers deploy',
    '"deploy": "bun run build && wrangler deploy"',
    '"deploy:cloudflare": "opennextjs-cloudflare deploy"',
    'node node_modules/wrangler/bin/wrangler.js deploy',
    "execFileSync('bun', [\n  'x',\n  'wrangler',\n  'versions',\n  'upload',\n]);",
    'bun x wrangler deploy \\\n  -c a.json --message "$SHA"',
    'wrangler deploy & echo --dry-run',
    'wrangler deploy --message "--dry-run"',
    'wrangler deploy --message "x --dry-run"',
    "wrangler deploy --message='x --local'",
    String.raw`"deploy": "wrangler deploy --message \"x --dry-run\""`,
    "spawn('wrangler', ['deploy', '--message', 'x --dry-run']);",
    "execSync('wrangler deploy')",
    '$`wrangler deploy`',
    'await $`wrangler deploy`.quiet();',
    'await $`wrangler deploy`.text()',
    '$.sync`wrangler deploy`',
    "subprocess.check_output('wrangler deploy'.split())",
    'const command="wrangler deploy";',
    "subprocess.run('wrangler deploy', shell=True)",
    "spawnSync('sh', ['-c', 'wrangler deploy'])",
    `execSync('npx wrangler deploy --message "x --dry-run"')`,
    'npx wrangler pages deploy dist',
    'FOO=1 bunx --bun wrangler deploy',
  ])
    assert.equal(countPublishCalls(source), 1, source);
  for (const source of [
    'wrangler deploy --dry-run --outdir out',
    'wrangler deploy --message "x --dry-run" --dry-run',
    "spawn('wrangler', ['deploy', '--message', 'x --dry-run', '--dry-run']);",
    'wrangler types --env-interface Env',
    'wrangler versions list --name gw --json',
    'wrangler deployments list --name gw',
    'wrangler secret list --name gw --format json',
    'wrangler d1 migrations apply DB --local',
    '"build:cloudflare": "opennextjs-cloudflare build"',
    '// cf replaces wrangler for this worker',
    "'wrangler.deploy.json'",
    'echo "run: bun wrangler secret put TOKEN"',
    'echo bash -c "wrangler deploy"',
    "execSync('npx wrangler deploy --dry-run')",
    'wrangler deploy --dry-run --message "wrangler deploy"',
    'echo "Dry-run only; do not run wrangler deploy"',
    'run: echo "use cf && never wrangler deploy | tee log"',
    "printf '%s\\n' 'wrangler deploy'",
  ])
    assert.equal(countPublishCalls(source), 0, source);
  // Flags of one manifest script never excuse another script's call.
  assert.equal(
    countPublishCalls(
      '{\n  "deploy": "wrangler deploy",\n  "check": "wrangler deploy --dry-run"\n}'
    ),
    1
  );
  assert.equal(
    countPublishCalls('wrangler deploy && wrangler versions deploy x@100%'),
    2
  );
});

test('publish calls ratchet down and admission cannot raise them', () => {
  const problems = [];
  const found = scanPublishCalls();
  for (const [file, count] of Object.entries(found)) {
    const allowed = allowlist.publishCalls?.[file] ?? 0;
    if (count > allowed)
      problems.push(
        `${file}: ${count} Wrangler publish calls exceed ${allowed}. Publish with cf (see apps/docs/build/development-tools/cf-cli-wrangler-parity.mdx).`
      );
    else if (count < allowed)
      problems.push(
        `${file}: publish calls fell ${allowed} -> ${count}; lower publishCalls`
      );
  }
  for (const file of Object.keys(allowlist.publishCalls ?? {}))
    if (!found[file])
      problems.push(`${file}: no publish calls remain; delete its entry`);
  assert.deepEqual(problems, []);
  // Tests and fixtures quote commands as data and stay on the token ratchet.
  assert.deepEqual(
    scanPublishCalls({
      files: ['a.test.mjs', 'fixtures/x.json', 'run.sh'],
      readFile: () => 'wrangler deploy',
    }),
    { 'run.sh': 1 }
  );

  assert.deepEqual(
    scanPublishCalls({
      files: ['apps/fixture/package.json'],
      readFile: () =>
        JSON.stringify({
          scripts: { deploy: 'wrangler deploy --message "x --dry-run"' },
        }),
    }),
    { 'apps/fixture/package.json': 1 }
  );

  const base = { publishCalls: { 'run.sh': 1 } };
  assert.deepEqual(
    validatePublishTransition(base, { publishCalls: { 'run.sh': 1 } }),
    []
  );
  assert.deepEqual(validatePublishTransition(base, { publishCalls: {} }), []);
  assert.match(
    validatePublishTransition(base, { publishCalls: { 'run.sh': 2 } }).join(),
    /grew 1 -> 2; publish with cf/
  );
  assert.match(
    validatePublishTransition(base, {
      publishCalls: { 'run.sh': 1, 'new.sh': 1 },
    }).join(),
    /new\.sh: Wrangler publish calls grew 0 -> 1/
  );
  assert.deepEqual(validatePublishTransition({}, { publishCalls: {} }), []);
});

test('publish calls only shrink relative to the base revision', (t) => {
  const base = baseAllowlist();
  if (!base) {
    t.skip('no base allowlist available in this checkout');
    return;
  }
  // Before publishCalls existed, the base tree itself is the baseline.
  const previous = base.allowlist.publishCalls
    ? base.allowlist
    : { publishCalls: scanPublishCallsAt(base.ref) };
  assert.deepEqual(
    validatePublishTransition(previous, allowlist),
    [],
    base.ref
  );
});
