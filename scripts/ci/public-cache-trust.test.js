const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const test = require('node:test');

// Public dispatch workflows run on the default branch, so every job's runner cache
// scope is the trusted `main` scope and a hosted job's runtime token cannot be
// withheld. Admitted source therefore executes in its own job (read-only token, no
// secrets, no cache restore/save, no cache-enabled setup) and only artifacts cross
// to a separate consumer job that checks out fresh trusted control, never checks out
// or executes admitted code, and only reads artifacts as bounded data.
const TRUSTED_PREFIX = 'trusted-main-';
const ADMITTED_PREFIX = 'admitted-pr-';
const workflows = {
  'public-merged-main-tests': {
    exec: 'shards',
    command: /^node \.\.\/control\/scripts\/ci\/public-test-shard\.js /,
  },
  'public-build-artifact': {
    exec: 'build',
    command: /^node \.\.\/control\/scripts\/ci\/public-build\.js /,
  },
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const workflowText = (name) =>
  fs.readFileSync(
    path.join(__dirname, '../../.github/workflows', `${name}.yaml`),
    'utf8'
  );

function parseJobs(text) {
  const jobs = {};
  let job = null;
  let step = null;
  let inJobs = false;
  let inSteps = false;
  for (const line of text.split('\n')) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    const header = line.match(/^ {2}([\w-]+):\s*$/);
    if (header) {
      job = { name: header[1], head: [], steps: [] };
      jobs[job.name] = job;
      step = null;
      inSteps = false;
      continue;
    }
    if (!job) continue;
    if (/^ {4}steps:\s*$/.test(line)) inSteps = true;
    else if (inSteps && /^ {6}- /.test(line)) {
      step = { lines: [line.replace(/^ {6}- /, '')] };
      job.steps.push(step);
    } else if (inSteps && step) step.lines.push(line.replace(/^ {8}/, ''));
    else job.head.push(line);
  }
  for (const j of Object.values(jobs)) {
    j.headText = j.head.filter((l) => !/^\s*#/.test(l)).join('\n');
    j.needs = (j.headText.match(/^ {4}needs: (.+)$/m)?.[1] ?? '')
      .replace(/[[\]]/g, '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    j.permissions = j.headText
      .match(/^ {4}permissions:\n((?: {6}.+\n?)+)/m)?.[1]
      .trim()
      .split('\n')
      .map((l) => l.trim());
    for (const s of j.steps) {
      s.text = s.lines.filter((l) => !/^\s*#/.test(l)).join('\n');
      s.uses = s.text.match(/^uses: (\S+)/m)?.[1];
      s.name = s.text.match(/^name: (.+)$/m)?.[1];
      s.run = s.text.match(/^run: (.+)$/m)?.[1]?.trim();
      s.workingDirectory = s.text.match(/^working-directory: (\S+)/m)?.[1];
    }
  }
  return jobs;
}

const cacheUse =
  /^(?:actions\/cache(?:\/(?:restore|save))?|[\w-]+\/cache[\w/-]*)@/;
const setupUse = /^[\w-]+\/setup-[\w-]+@/;
const credential =
  /secrets\.|github\.token|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_CACHE_URL|ACTIONS_RESULTS_URL|ACTIONS_ID_TOKEN|TURBO_(?:TOKEN|TEAM|API|REMOTE)/;
const publishing =
  /actions\/upload-artifact@|actions\/attest|\bgh\s|\bcurl\s|\bwget\s|git push|npm publish|wrangler\s|vercel\s/;

function cacheKeys(step) {
  const keys = [];
  const key = step.text.match(/^ {2}key: (.+)$/m)?.[1];
  if (key) keys.push(key.trim());
  const block = step.text.match(
    /^ {2}restore-keys: \|\n((?: {4}.+\n?)*)/m
  )?.[1];
  const inline = step.text.match(/^ {2}restore-keys: ([^|\n].*)$/m)?.[1];
  if (inline) keys.push(inline.trim());
  if (block)
    keys.push(
      ...block
        .split('\n')
        .map((k) => k.trim())
        .filter(Boolean)
    );
  return keys;
}

// Returns the list of cache/job-boundary violations for one workflow's text.
function violations(text, { exec, command }) {
  const found = [];
  const add = (message) => found.push(message);
  const triggers = text.split(/^permissions:/m)[0];
  if (
    !/^on:\n {2}workflow_dispatch:/m.test(triggers) ||
    /pull_request|workflow_run|schedule:|push:|issue_comment/.test(triggers)
  )
    add('workflow must trigger only on workflow_dispatch');
  if (/pull_request_target|self-hosted|environment:|secrets[.:]/.test(text))
    add('privileged trigger, runner, environment or secret reference');
  if (!/^permissions:\n {2}contents: read\n {2}actions: read\n\n/m.test(text))
    add('workflow permissions must stay read-only');
  const jobs = parseJobs(text);
  const execJob = jobs[exec];
  const consumer = jobs.summary;
  if (!execJob || !consumer || !jobs.trust || !jobs.admit)
    return [...found, 'admit, trust, execution and summary jobs are required'];
  const hasSource = (j) =>
    j.steps.some((s) => s.name === 'Checkout admitted source');
  if (Object.values(jobs).filter(hasSource).length !== 1 || !hasSource(execJob))
    add('admitted source must be checked out only by the execution job');
  for (const j of Object.values(jobs))
    for (const s of j.steps) {
      const uses = s.uses ?? '';
      if (
        /^actions\/checkout@/.test(uses) &&
        !/^ {2}persist-credentials: false$/m.test(s.text)
      )
        add(`${j.name}: checkout must not persist credentials`);
      if (
        /^actions\/setup-node@/.test(uses) &&
        !/^ {2}package-manager-cache: false$/m.test(s.text)
      )
        add(
          `${j.name}: setup-node must disable automatic package-manager cache`
        );
      if (cacheUse.test(uses)) {
        if (j === execJob)
          add(`${j.name}: execution job must not use any cache action`);
        else if (!/^actions\/cache\/restore@/.test(uses))
          add(
            `${j.name}: only restore-only cache steps are allowed outside execution`
          );
        const keys = cacheKeys(s);
        if (!keys.length)
          add(`${j.name}: cache step without an explicit scoped key`);
        for (const k of keys)
          if (!k.startsWith(TRUSTED_PREFIX) || k.startsWith(ADMITTED_PREFIX))
            add(
              `${j.name}: cache key ${k} is outside the ${TRUSTED_PREFIX} scope`
            );
      }
    }
  // Execution job: read-only token, no secrets, no cache, nothing after source but the run.
  if (execJob.permissions?.join() !== 'contents: read')
    add(`${exec}: execution job permissions must be exactly contents: read`);
  if (credential.test(execJob.headText))
    add(`${exec}: execution job env exposes a credential`);
  if (!execJob.needs.includes('trust') || !execJob.needs.includes('admit'))
    add(`${exec}: execution job must wait for admit and trust`);
  const sourceIndex = execJob.steps.findIndex(
    (s) => s.name === 'Checkout admitted source'
  );
  const controlIndex = execJob.steps.findIndex(
    (s) => s.name === 'Checkout immutable workflow controls'
  );
  if (controlIndex === -1 || controlIndex > sourceIndex)
    add(`${exec}: controls must be checked out before source`);
  for (const [i, s] of execJob.steps.entries()) {
    if (i <= sourceIndex) continue;
    const uses = s.uses ?? '';
    if (cacheUse.test(uses) || setupUse.test(uses))
      add(
        `${exec}: restore/save-capable action after source checkout: ${uses}`
      );
    if (/^actions\/(?:github-script|download-artifact)@/.test(uses))
      add(`${exec}: ${uses.split('@')[0]} after source checkout`);
    if (credential.test(s.text))
      add(
        `${exec}: credential reachable after source checkout in "${s.name ?? uses}"`
      );
    if (/setup-bun-with-backoff|curl |wget /.test(s.text))
      add(`${exec}: tool installation after source checkout`);
  }
  const after = execJob.steps.slice(sourceIndex + 1);
  const allowed = after.filter(
    (s) =>
      /^Verify both immutable checkout identities/.test(s.name ?? '') ||
      (s.run && command.test(s.run) && s.workingDirectory === 'source') ||
      /^actions\/upload-artifact@/.test(s.uses ?? '')
  );
  if (allowed.length !== after.length)
    add(`${exec}: unexpected step after source checkout`);
  const bun = execJob.steps.findIndex((s) =>
    /setup-bun-with-backoff/.test(s.text)
  );
  if (bun === -1 || bun > sourceIndex)
    add(`${exec}: Bun setup must precede source checkout`);
  else if (execJob.steps[bun].workingDirectory !== 'control')
    add(`${exec}: Bun setup must run from immutable controls`);
  // Trust job: verifies dispatch records before and outside admitted-code execution.
  if (
    hasSource(jobs.trust) ||
    !jobs.trust.steps.some((s) => /trusted-public:start/.test(s.text))
  )
    add(
      'trust: must verify dispatch records without checking out admitted source'
    );
  // Consumer: separate job, fresh trusted control, no admitted code, artifacts as data only.
  if (!consumer.needs.includes(exec) || !consumer.needs.includes('admit'))
    add('summary: consumer must depend on admit and the execution job');
  if (consumer.permissions?.join() !== 'contents: read')
    add('summary: consumer permissions must be exactly contents: read');
  const checkouts = consumer.steps.filter((s) =>
    /^actions\/checkout@/.test(s.uses ?? '')
  );
  if (
    checkouts.length !== 1 ||
    !/^ {2}ref: \$\{\{ github\.workflow_sha \}\}$/m.test(checkouts[0].text) ||
    !/^ {2}path: control$/m.test(checkouts[0].text)
  )
    add(
      'summary: consumer must check out exactly one fresh control at github.workflow_sha'
    );
  if (credential.test(consumer.headText))
    add('summary: consumer env exposes a credential');
  for (const s of consumer.steps) {
    const label = s.name ?? s.uses;
    if (credential.test(s.text))
      add(`summary: credential reachable in "${label}"`);
    if (publishing.test(s.text))
      add(`summary: consumer must not publish: ${label}`);
    const code = s.text.replace(/\/\/ .*|'tar'/g, '');
    if (
      /\btar\s+-?[a-z]*x|\bunzip\b|\.\.\/control|\bsource\/|\bbun\b|\bnpm\b/.test(
        code
      )
    )
      add(
        `summary: consumer must not extract or execute artifact or source code: ${label}`
      );
  }
  return found;
}

for (const [name, config] of Object.entries(workflows)) {
  const text = workflowText(name);
  test(`${name}: admitted code runs in an isolated read-only job; privileged consumers are separate`, () => {
    assert.deepEqual(violations(text, config), []);
    assert.deepEqual(Object.keys(parseJobs(text)), [
      'admit',
      'trust',
      config.exec,
      'summary',
    ]);
    assert.ok(
      text.indexOf('// trusted-public:start') <
        text.indexOf('- name: Checkout admitted source')
    );
  });

  test(`${name}: no cache is restored or saved anywhere, so no prefix can cross trust scopes`, () => {
    assert.ok(
      !/actions\/cache|restore-keys|cache-dependency-path|^\s*cache: /m.test(
        text
      )
    );
    assert.equal([...text.matchAll(/package-manager-cache: false/g)].length, 1);
    assert.ok(
      !/TURBO_(?:TOKEN|TEAM|API|REMOTE)|TURBO_CACHE: '[^']*remote/.test(text)
    );
  });

  test(`${name}: mutations that collapse jobs or reopen a cache, secret or publish path are rejected`, () => {
    const mutate = (from, to) => {
      assert.ok(text.includes(from), `fixture anchor missing: ${from}`);
      return text.replace(from, to);
    };
    const identityStep =
      '      - name: Verify both immutable checkout identities';
    const insertBeforeIdentity = (step) =>
      mutate(identityStep, step + identityStep);
    const inConsumer = (step) => {
      const header = text.indexOf('  summary:\n');
      const at = text.indexOf('    steps:\n', header) + '    steps:\n'.length;
      return text.slice(0, at) + step + text.slice(at);
    };
    const cache = (uses, keys) =>
      `      - uses: ${uses}@0000000000000000000000000000000000000000\n        with:\n          path: ~/cache-fixture\n          key: ${keys[0]}\n          restore-keys: |\n${keys
        .slice(1)
        .map((k) => `            ${k}\n`)
        .join('')}`;
    const execPermissions =
      /(needs: \[admit, trust\]\n(?: {4}#.*\n)*    permissions:\n      contents: )read/;
    const consumerPersist = (value) => {
      const at = text.indexOf('  summary:\n');
      return (
        text.slice(0, at) +
        text
          .slice(at)
          .replace(
            'persist-credentials: false',
            `persist-credentials: ${value}`
          )
      );
    };
    const cases = {
      'setup-node auto cache': mutate(
        '          package-manager-cache: false\n',
        ''
      ),
      'bun setup after source': (() => {
        const bun = text.match(
          /      - name: Setup pinned Bun[^\n]*\n {8}working-directory: control\n {8}run: [^\n]*\n/
        )[0];
        return text
          .replace(bun, '')
          .replace(
            /(      - name: Verify both immutable checkout identities[\s\S]*?SOURCE_SHA"\n)/,
            `$1${bun}`
          );
      })(),
      'cache restore with prefix fallback in the execution job':
        insertBeforeIdentity(
          cache('actions/cache', [`${ADMITTED_PREFIX}deps`, ADMITTED_PREFIX])
        ),
      'cache save in the execution job': insertBeforeIdentity(
        cache('actions/cache/save', [`${ADMITTED_PREFIX}deps`, 'x'])
      ),
      'cache-enabled setup after source': insertBeforeIdentity(
        '      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0\n        with:\n          package-manager-cache: false\n'
      ),
      'secret after source': insertBeforeIdentity(
        '      - name: Publish\n        run: echo "${{ secrets.EXAMPLE }}"\n'
      ),
      'write token after source': insertBeforeIdentity(
        '      - name: Leak\n        env:\n          T: ${{ github.token }}\n        run: true\n'
      ),
      'pull_request trigger': mutate(
        'on:\n  workflow_dispatch:',
        'on:\n  pull_request:\n  workflow_dispatch:'
      ),
      'collapsed jobs: artifact download inside the execution job':
        insertBeforeIdentity(
          '      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          path: artifact\n'
        ),
      'execution job with write permission': text.replace(
        execPermissions,
        '$1write'
      ),
      'execution job without permissions block': text.replace(
        /(needs: \[admit, trust\]\n(?: {4}#.*\n)*)    permissions:\n      contents: read\n/,
        '$1'
      ),
      'execution job without trust dependency': text.replace(
        'needs: [admit, trust]',
        'needs: admit'
      ),
      'consumer restores an admitted prefix': inConsumer(
        cache('actions/cache/restore', [
          `${TRUSTED_PREFIX}deps`,
          ADMITTED_PREFIX,
        ])
      ),
      'consumer shares a prefix with admitted jobs': inConsumer(
        cache('actions/cache/restore', ['deps-linux', 'deps-'])
      ),
      'consumer short prefix covers both scopes': inConsumer(
        cache('actions/cache/restore', [`${TRUSTED_PREFIX}deps`, 'trusted-'])
      ),
      'consumer saves a cache': inConsumer(
        cache('actions/cache/save', [`${TRUSTED_PREFIX}deps`, TRUSTED_PREFIX])
      ),
      'consumer uses a secret': inConsumer(
        '      - name: Use\n        run: echo "${{ secrets.TOKEN }}"\n'
      ),
      'consumer publishes': inConsumer(
        '      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n        with:\n          path: artifact\n'
      ),
      'consumer extracts the archive': inConsumer(
        '      - name: Extract\n        run: tar -xzf artifact/public-compiler.tar.gz\n'
      ),
      'consumer executes artifact code': inConsumer(
        '      - name: Run\n        run: node artifact/x.js ../control/y\n'
      ),
      'consumer checks out admitted source': inConsumer(
        '      - name: Checkout admitted source\n        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          ref: ${{ needs.admit.outputs.sha }}\n          path: source\n          persist-credentials: false\n'
      ),
      'consumer persists credentials': consumerPersist('true'),
      'consumer write permission': text.replace(
        /(  summary:[\s\S]*?permissions:\n {6}contents: )read/,
        '$1write'
      ),
    };
    for (const [label, mutated] of Object.entries(cases)) {
      if (label !== 'pull_request trigger')
        assert.notEqual(mutated, text, `${label}: mutation did not apply`);
      assert.notDeepEqual(
        violations(mutated, config),
        [],
        `${label} must be rejected`
      );
    }
    // Positive control: a trusted-main-* restore-only step in the consumer stays safe.
    const safe = inConsumer(
      cache('actions/cache/restore', [
        `${TRUSTED_PREFIX}deps-linux`,
        TRUSTED_PREFIX,
      ])
    );
    assert.deepEqual(violations(safe, config), []);
  });
}

const run = (script, cwd, env) => {
  const result = spawnSync(process.execPath, ['-'], {
    input: script,
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  result.summary = fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
  return result;
};
const verifier = (name) => {
  const body = workflowText(name).match(
    /node <<'NODE'\n([\s\S]*?)\n\s*NODE\n/
  )[1];
  return body
    .split('\n')
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n');
};
const control = 'b'.repeat(40);
const source = 'a'.repeat(40);
const main = 'e'.repeat(40);
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-consumer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'control/scripts/ci'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'public-ci.js'),
    path.join(root, 'control/scripts/ci/public-ci.js')
  );
  fs.writeFileSync(path.join(root, 'summary.md'), '');
  return root;
}
const baseEnv = (root, extra = {}) => ({
  SOURCE_SHA: source,
  CONTROL_SHA: control,
  MAIN_SHA: main,
  GITHUB_RUN_ID: '7',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_STEP_SUMMARY: path.join(root, 'summary.md'),
  ...extra,
});

function testReceipts(root, mutate = () => {}) {
  const expected = ['unit', 'root', 'types']
    .flatMap((k) => [0, 1, 2, 3].map((i) => [k, i]))
    .concat([['lint', 0]]);
  for (const [kind, shard] of expected) {
    const dir = path.join(
      root,
      'receipts',
      `public-tests-${source}-${kind}-${shard}-1`
    );
    fs.mkdirSync(dir, { recursive: true });
    const receipt = {
      kind,
      shard,
      status: 'PASS',
      sourceSHA: source,
      controlSHA: control,
      admittedMainSHA: main,
      run: '7',
      attempt: '1',
      commands: [{ exit: 0, qualified: true, counts: { tests: 3 } }],
    };
    mutate(receipt, dir, kind, shard);
    if (!fs.existsSync(path.join(dir, 'receipt.json')))
      fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
  }
}

test('merged-main consumer accepts exactly thirteen matching receipts and rejects tampering as data', (t) => {
  const script = verifier('public-merged-main-tests');
  const check = (mutate) => {
    const root = workspace(t);
    testReceipts(root, mutate);
    return run(script, root, baseEnv(root));
  };
  const good = check();
  assert.equal(good.status, 0, `${good.stderr}${good.summary}`);
  const first = (fn) => (r, dir, kind, shard) => {
    if (kind === 'unit' && shard === 0) fn(r, dir);
  };
  const cases = {
    'wrong source SHA': first((r) => {
      r.sourceSHA = 'd'.repeat(40);
    }),
    'wrong control SHA': first((r) => {
      r.controlSHA = 'd'.repeat(40);
    }),
    'wrong run': first((r) => {
      r.run = '8';
    }),
    'unqualified command': first((r) => {
      r.commands[0].qualified = false;
    }),
    'zero tests everywhere': (r) => {
      r.commands[0].counts.tests = 0;
    },
    'extra file in artifact': first((r, dir) =>
      fs.writeFileSync(path.join(dir, 'extra.js'), 'process.exit(0)')
    ),
    'symlinked receipt': first((r, dir) => {
      fs.symlinkSync(
        path.join(dir, '../../summary.md'),
        path.join(dir, 'receipt.json')
      );
    }),
    'oversized receipt': first((r) => {
      r.pad = 'x'.repeat(5 * 1024 * 1024);
    }),
    'receipt name mismatch': first((r) => {
      r.shard = 1;
    }),
  };
  for (const [label, mutate] of Object.entries(cases))
    assert.notEqual(check(mutate).status, 0, `${label} must fail`);
  const root = workspace(t);
  testReceipts(root);
  fs.rmSync(path.join(root, 'receipts', `public-tests-${source}-lint-0-1`), {
    recursive: true,
  });
  assert.notEqual(run(script, root, baseEnv(root)).status, 0);
});

function pair(root, mutate = {}) {
  const dir = path.join(root, 'artifact');
  const stage = path.join(root, 'stage');
  fs.mkdirSync(dir, { recursive: true });
  const members = {
    'apps/meet/dist/ssr/index.js': 'export default {}',
    'apps/meet/dist/client/app.js': 'console.log(1)',
    'apps/meet-realtime/dist/worker/index.js': 'export default {}',
    ...(mutate.members ?? {}),
  };
  const files = Object.entries(members).map(([p, body]) => {
    const file = path.join(stage, p);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (body === null) fs.symlinkSync('/etc/hosts', file);
    else fs.writeFileSync(file, body);
    const bytes = body === null ? 0 : Buffer.byteLength(body);
    return { path: p, bytes, sha256: sha(body ?? '') };
  });
  const list = files.map((f) => f.path);
  fs.writeFileSync(
    path.join(dir, 'archive-members.txt'),
    list.join('\n') + '\n'
  );
  const archive = path.join(dir, 'public-compiler.tar.gz');
  const made = spawnSync('tar', ['-czf', archive, '-C', stage, ...list]);
  assert.equal(made.status, 0, String(made.stderr));
  const receipt = {
    status: 'PASS',
    kind: 'public-build',
    app: 'meet',
    sourceSHA: source,
    controlSHA: control,
    admittedMainSHA: main,
    run: '7',
    attempt: '1',
    artifactKind: 'public-compiler-meet-pair',
    deployAcceptance: false,
    entries: [
      'apps/meet/dist/ssr/index.js',
      'apps/meet-realtime/dist/worker/index.js',
    ],
    files,
    fileCount: files.length,
    byteCount: files.reduce((n, f) => n + f.bytes, 0),
    archiveSHA256: sha(fs.readFileSync(archive)),
    archiveBytes: fs.statSync(archive).size,
    ...(mutate.receipt ?? {}),
  };
  const receiptBytes = JSON.stringify(receipt);
  fs.writeFileSync(path.join(dir, 'receipt.json'), receiptBytes);
  fs.writeFileSync(
    path.join(dir, 'SHA256SUMS'),
    mutate.sums ??
      `${sha(receiptBytes)}  receipt.json\n${receipt.archiveSHA256}  public-compiler.tar.gz\n`
  );
}

test('build consumer verifies the pair manifest, hashes and archive without extracting or executing', (t) => {
  const script = verifier('public-build-artifact');
  const check = (mutate, app = 'meet') => {
    const root = workspace(t);
    pair(root, mutate);
    return { result: run(script, root, baseEnv(root, { APP: app })), root };
  };
  const ok = check();
  assert.equal(ok.result.status, 0, `${ok.result.stderr}${ok.result.summary}`);
  assert.match(
    fs.readFileSync(path.join(ok.root, 'summary.md'), 'utf8'),
    /Public pair verified as data: 3 files/
  );
  assert.ok(
    !fs.existsSync(path.join(ok.root, 'apps')),
    'consumer must not extract the archive'
  );
  const cases = {
    'tampered SHA256SUMS': {
      sums: `${'0'.repeat(64)}  receipt.json\n${'1'.repeat(64)}  public-compiler.tar.gz\n`,
    },
    'wrong run identity': { receipt: { run: '8' } },
    'wrong source identity': { receipt: { sourceSHA: 'd'.repeat(40) } },
    'deploy acceptance claimed': { receipt: { deployAcceptance: true } },
    'wrong byte count': { receipt: { byteCount: 1 } },
    'pair member missing': {
      receipt: {
        entries: [
          'apps/meet/dist/ssr/index.js',
          'apps/meet-realtime/dist/worker/missing.js',
        ],
      },
    },
    'single-member pair': {
      receipt: { entries: ['apps/meet/dist/ssr/index.js'] },
    },
    'traversal path in manifest': {
      receipt: {
        files: [
          {
            path: 'apps/meet/dist/../../../etc/passwd',
            bytes: 1,
            sha256: 'a'.repeat(64),
          },
        ],
        fileCount: 1,
        byteCount: 1,
      },
    },
    'private env file in archive': {
      members: { 'apps/meet/dist/client/.env.local': 'SECRET=1' },
    },
    'symlink member in archive': {
      members: { 'apps/meet/dist/client/link.js': null },
    },
    'unapproved root': { members: { 'apps/web/src/index.ts': 'x' } },
  };
  for (const [label, mutate] of Object.entries(cases))
    assert.notEqual(check(mutate).result.status, 0, `${label} must fail`);
  assert.notEqual(
    check({}, 'web').result.status,
    0,
    'non-meet app has no public artifact contract'
  );
  const extra = workspace(t);
  pair(extra);
  fs.writeFileSync(path.join(extra, 'artifact/run.sh'), '#!/bin/sh');
  assert.notEqual(
    run(script, extra, baseEnv(extra, { APP: 'meet' })).status,
    0
  );
});
