const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const actionPath = '.github/actions/cache-litertlm-native/action.yml';
const action = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
      actionPath,
    ],
    { encoding: 'utf8' }
  )
);
const restore = action.runs.steps.find((s) => s.id === 'archive');
const prepare = action.runs.steps.find((s) => s.id === 'native');
const save = action.runs.steps.at(-1);
const hash = '3f7854efdd73c893d48bc43df66102fda5c1de63179295275a37acb9427a949e';
const packageHash =
  'b18ca6829f7d11b62328f0345399f4f5c5749cb2457c1d2fcb6d56d9e79f0f66';
const expression = (body) => '$' + '{{ ' + body + ' }}';
const writeExecutable = (file, contents) =>
  fs.writeFileSync(file, contents, { mode: 0o755 });

test('native archive cache has exact package/native/platform/checksum identity and no prefix restore', () => {
  assert.equal(
    restore.uses,
    'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
  );
  assert.equal(
    save.uses,
    'actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
  );
  assert.equal(
    restore.with.path,
    expression('runner.temp') + '/litertlm-native/litertlm-linux_x86_64.tar.gz'
  );
  assert.equal(restore.with['restore-keys'], undefined);
  assert.equal(save.with.path, restore.with.path);
  assert.equal(save.with.key, restore.with.key);
  assert.equal(prepare.env.LITERTLM_SHA256, hash);
  const scope = { runner: { os: 'Linux', arch: 'X64' } };
  const key = renderTemplate(restore.with.key, scope);
  assert.equal(
    key,
    `litertlm-native-v1-Linux-X64-pub-1.8.7-native-v0.17.1-a-${hash}`
  );
  for (const [field, value] of [
    ['os', 'Windows'],
    ['arch', 'ARM64'],
  ])
    assert.notEqual(
      renderTemplate(restore.with.key, {
        runner: { ...scope.runner, [field]: value },
      }),
      key
    );
  assert.equal(prepare.env.GH_TOKEN, expression('github.token'));
  assert.equal(
    prepare.if,
    undefined,
    'verification is unconditional on every restored archive'
  );
  assert.equal(prepare['continue-on-error'], undefined);
});

test('only verified main push/manual input can be saved; never a PR or failed preparation', () => {
  for (const event of [
    'push',
    'workflow_dispatch',
    'pull_request',
    'pull_request_target',
    'workflow_run',
    'schedule',
  ]) {
    for (const ref of [
      'refs/heads/main',
      'refs/heads/feature',
      'refs/pull/1/merge',
    ]) {
      for (const verified of ['', 'true']) {
        const allowed = evaluateExpression(save.if, {
          github: { event_name: event, ref },
          steps: {
            archive: { outputs: { 'cache-hit': 'false' } },
            native: { outputs: { verified } },
          },
        });
        assert.equal(
          Boolean(allowed),
          ['push', 'workflow_dispatch'].includes(event) &&
            ref === 'refs/heads/main' &&
            verified === 'true'
        );
      }
    }
  }
  assert.equal(
    Boolean(
      evaluateExpression(save.if, {
        github: { event_name: 'push', ref: 'refs/heads/main' },
        steps: {
          archive: { outputs: { 'cache-hit': 'true' } },
          native: { outputs: { verified: 'true' } },
        },
      })
    ),
    false
  );
});

test('all mobile test shards prepare this input without changing their commands or security authority', () => {
  const mobile = readWorkflow('mobile.yaml', { raw: true });
  assert.deepEqual(mobile.permissions, { contents: 'read' });
  assert.deepEqual(mobile.jobs.tests.strategy.matrix.shard, [0, 1, 2, 3]);
  const steps = mobile.jobs.tests.steps;
  const cache = steps.findIndex(
    (s) => s.uses === './.github/actions/cache-litertlm-native'
  );
  const tests = steps.findIndex((s) => s.name === 'Run test shard');
  assert.equal(cache + 1, tests);
  assert.equal(steps[cache].if, undefined);
  assert.equal(
    steps[tests].run,
    'flutter test --concurrency=2 --total-shards=4 --shard-index=${{ matrix.shard }} -r expanded'
  );
  const parity = mobile.jobs['realtime-parity'].steps;
  const parityCache = parity.findIndex(
    (s) => s.uses === './.github/actions/cache-litertlm-native'
  );
  const parityTest = parity.findIndex(
    (s) => s.name === 'Verify native/web room protocol against local Cloudflare'
  );
  assert.equal(parityCache + 1, parityTest);
  assert.equal(parity[parityCache].if, undefined);
  assert.equal(
    parity[parityTest].run,
    'bun apps/meet-realtime/tests/mobile-local-check.ts'
  );
  for (const event of ['push', 'pull_request'])
    assert.ok(
      mobile.on[event].paths.includes(
        '.github/actions/cache-litertlm-native/**'
      )
    );
});

for (const scenario of [
  'hit',
  'miss',
  'corrupt-hit',
  'corrupt-download',
  'network-fail',
  'wrong-package',
  'missing-library',
]) {
  test(`native prepare shell ${scenario}`, (t) => {
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'litertlm-cache-'));
    t.after(() => fs.rmSync(box, { recursive: true, force: true }));
    const temp = path.join(box, 'temp');
    const bin = path.join(box, 'bin');
    const source = path.join(box, 'source');
    const workspace = path.join(box, 'workspace');
    const native = path.join(box, 'native');
    for (const dir of [
      temp,
      bin,
      source,
      native,
      path.join(workspace, 'apps/mobile'),
    ])
      fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(workspace, 'apps/mobile/pubspec.lock'),
      `packages:\n  flutter_edge_ai_litertlm:\n    dependency: direct main\n    description:\n      sha256: ${packageHash}\n      url: "https://pub.dev"\n    source: hosted\n    version: "${scenario === 'wrong-package' ? '1.8.8' : '1.8.7'}"\n  unrelated:\n    version: "1.0.0"\n`
    );
    fs.writeFileSync(
      path.join(
        source,
        scenario === 'missing-library' ? 'unrelated.so' : 'libLiteRtLm.so'
      ),
      'synthetic native library; never executed'
    );
    fs.writeFileSync(path.join(source, 'companion.so'), 'synthetic companion');
    const fixture = path.join(box, 'fixture.tar.gz');
    execFileSync('tar', ['-czf', fixture, '-C', source, '.']);
    const checksum = createHash('sha256')
      .update(fs.readFileSync(fixture))
      .digest('hex');
    const archive = path.join(
      temp,
      'litertlm-native/litertlm-linux_x86_64.tar.gz'
    );
    if (scenario.endsWith('hit')) {
      fs.mkdirSync(path.dirname(archive));
      fs.writeFileSync(
        archive,
        scenario === 'hit' ? fs.readFileSync(fixture) : 'corrupt'
      );
    }
    const log = path.join(box, 'downloads');
    const sleeps = path.join(box, 'sleeps');
    const output = path.join(box, 'output');
    writeExecutable(
      path.join(bin, 'gh'),
      `#!/bin/sh
[ "$GH_TOKEN" = fixture-auth ] || exit 88
printf '%s\\n' "$*" >> "$DOWNLOAD_LOG"
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then shift; target="$1"; fi
  shift
done
if [ "$SCENARIO" = network-fail ]; then printf partial > "$target"; exit 22; fi
if [ "$SCENARIO" = corrupt-download ]; then printf corrupt > "$target"; else cp "$FIXTURE" "$target"; fi
`
    );
    writeExecutable(
      path.join(bin, 'timeout'),
      '#!/bin/sh\n[ "$1" = 120 ] || exit 87\nshift\nexec "$@"\n'
    );
    writeExecutable(
      path.join(bin, 'sleep'),
      '#!/bin/sh\nprintf "%s\\n" "$1" >> "$SLEEP_LOG"\n'
    );
    if (process.platform === 'darwin')
      writeExecutable(
        path.join(bin, 'sha256sum'),
        `#!${process.execPath}
const fs = require('node:fs');
const crypto = require('node:crypto');
require('node:assert/strict').deepEqual(process.argv.slice(2), ['--check', '--strict']);
const m = /^([a-f0-9]{64})  (.+)$/.exec(fs.readFileSync(0, 'utf8').trimEnd());
const ok = m && crypto.createHash('sha256').update(fs.readFileSync(m[2])).digest('hex') === m[1];
console.log(ok ? ': OK' : ': FAILED');
process.exit(ok ? 0 : 1);
`
      );
    const result = spawnSync('bash', ['-c', prepare.run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        GH_TOKEN: 'fixture-auth',
        GITHUB_TOKEN: 'fixture-parent',
        GITHUB_WORKSPACE: workspace,
        RUNNER_TEMP: temp,
        NATIVE_CACHE_ROOT: native,
        GITHUB_OUTPUT: output,
        LITERTLM_SHA256: checksum,
        SCENARIO: scenario,
        FIXTURE: fixture,
        DOWNLOAD_LOG: log,
        SLEEP_LOG: sleeps,
      },
    });
    assert.ifError(result.error);
    const succeeds = ['hit', 'miss'].includes(scenario);
    assert.equal(result.status === 0, succeeds, result.stdout + result.stderr);
    assert.equal(fs.existsSync(output), succeeds);
    assert.equal(
      fs.existsSync(path.join(native, '.flutter_gemma_native_version')),
      succeeds
    );
    assert.equal(
      fs.existsSync(path.join(native, 'linux_x86_64/libLiteRtLm.so')),
      succeeds
    );
    if (succeeds) {
      assert.equal(fs.readFileSync(output, 'utf8'), 'verified=true\n');
      assert.deepEqual(
        JSON.parse(
          fs.readFileSync(
            path.join(native, '.flutter_gemma_native_version'),
            'utf8'
          )
        ),
        { version: '0.17.1-a', owner: 'flutter_gemma_litertlm' }
      );
      assert.equal(
        fs.readFileSync(path.join(native, 'linux_x86_64/companion.so'), 'utf8'),
        'synthetic companion'
      );
      assert.match(result.stdout, /: OK/);
    }
    const shouldDownload = !['hit', 'corrupt-hit', 'wrong-package'].includes(
      scenario
    );
    assert.equal(fs.existsSync(log), shouldDownload);
    if (shouldDownload) {
      const commands = fs.readFileSync(log, 'utf8').trim().split('\n');
      assert.equal(commands.length, scenario === 'network-fail' ? 4 : 1);
      for (const cmd of commands) {
        assert.match(
          cmd,
          /^release download native-v0\.17\.1-a --repo DenisovAV\/flutter_edge_ai --pattern litertlm-linux_x86_64\.tar\.gz --output /
        );
        assert.doesNotMatch(cmd, /fixture-auth/);
      }
    }
    if (scenario === 'network-fail') {
      assert.equal(fs.existsSync(archive), false);
      assert.equal(fs.readFileSync(sleeps, 'utf8'), '1\n2\n4\n');
    }
    assert.equal(
      fs.readdirSync(native).some((f) => f.startsWith('.ci-litertlm-')),
      false
    );
  });
}
