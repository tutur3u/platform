const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ALLOWLIST,
  GUARD_TEST,
  SCANNER,
  cliUsageRatchetSteps,
  withoutRepeatedGuard,
} = require('./cli-usage-ratchet.js');
const { main } = require('../check-changed.js');
const { planChecks } = require('./plan.js');

const ROOT = path.resolve(__dirname, '../..');
// The ratchet scans this file, so the CLI's name is assembled at runtime.
const CLI = path.basename(SCANNER).split('-')[0];
const scanner = require(path.join(ROOT, SCANNER));
const countMentionLines =
  scanner[`count${CLI[0].toUpperCase()}${CLI.slice(1)}Lines`];
const allowlist = { files: { 'apps/a/deploy.yaml': {} }, publishCalls: {} };

const ADAPTER = ['opennextjs', 'cloudflare'].join('-');

function planned(changes, sources = {}, counted = allowlist) {
  return cliUsageRatchetSteps(changes, {
    readCliAllowlist: () => counted,
    readSource: (file) => {
      if (!(file in sources)) throw new Error(`unreadable: ${file}`);
      return sources[file];
    },
  }).map((step) => step.id);
}
const changed = (file, status = 'M') => [{ file, status }];

test('a file that mentions the CLI selects the ratchet wherever it lives', () => {
  const quoted = `const path = 'apps/web/${CLI}.jsonc';\n`;
  for (const file of [
    // A script test quoting a config path as data.
    'scripts/check-changed/example.test.js',
    'apps/web/src/lib/deploy.ts',
    'apps/web/package.json',
    '.github/workflows/example.yaml',
    'packages/utils/src/config.ts',
  ])
    assert.deepEqual(
      planned(changed(file), { [file]: quoted }),
      ['cli-usage-ratchet'],
      file
    );
  // The match is case-insensitive, as the scanner's is.
  assert.deepEqual(
    planned(changed('scripts/x.js'), { 'scripts/x.js': CLI.toUpperCase() }),
    ['cli-usage-ratchet']
  );
});

test('a config file is selected by its name, and an adapter deploy by its command', () => {
  // The scanner counts a config file whatever it contains.
  for (const file of [
    `workers/demo/${CLI}.jsonc`,
    `apps/web/${CLI}.staging.toml`,
    `${CLI}.json`,
  ])
    assert.deepEqual(
      planned(changed(file, 'A'), { [file]: '{}\n' }),
      ['cli-usage-ratchet'],
      file
    );
  // A publish through the Next adapter never names the CLI.
  const script = 'scripts/deploy-site.sh';
  assert.deepEqual(
    planned(changed(script, 'A'), { [script]: `bunx ${ADAPTER} deploy\n` }),
    ['cli-usage-ratchet']
  );
  // A manifest script is decoded as the scanner decodes it: a JSON escape
  // hides the name from a text match but not from the publish count.
  const escaped = (name) =>
    `{"scripts":{"deploy":"\\u00${name.charCodeAt(0).toString(16)}${name.slice(1)} deploy"}}`;
  for (const name of [ADAPTER, CLI]) {
    const manifest = escaped(name);
    assert.equal(manifest.includes(name), false);
    assert.deepEqual(
      planned(changed('apps/site/package.json'), {
        'apps/site/package.json': manifest,
      }),
      ['cli-usage-ratchet'],
      name
    );
  }
  assert.deepEqual(
    planned(changed('apps/site/package.json'), {
      'apps/site/package.json': '{"scripts":{"deploy":"cf deploy"}}',
    }),
    []
  );
});

test('a file that does not mention it leaves the ratchet out', () => {
  for (const file of ['scripts/x.js', 'apps/web/src/a.ts', 'package.json'])
    assert.deepEqual(
      planned(changed(file), { [file]: 'const a = 1;\n' }),
      [],
      file
    );
  // Files the scanner skips cannot change its result.
  for (const file of ['README.md', 'apps/docs/build/x.mdx', 'bun.lock'])
    assert.deepEqual(planned(changed(file), { [file]: CLI }), [], file);
  // A deleted file that was never counted leaves nothing behind.
  assert.deepEqual(planned(changed('scripts/gone.js', 'D')), []);
  assert.deepEqual(planned([]), []);
});

test('a counted file selects it when edited or removed, with or without a mention', () => {
  const file = 'apps/a/deploy.yaml';
  assert.deepEqual(planned(changed(file), { [file]: 'steps: []\n' }), [
    'cli-usage-ratchet',
  ]);
  assert.deepEqual(planned(changed(file, 'D')), ['cli-usage-ratchet']);
  // A file counted only for its publish calls is covered the same way.
  const publishing = { files: {}, publishCalls: { 'scripts/ship.sh': 1 } };
  assert.deepEqual(
    planned(
      changed('scripts/ship.sh'),
      { 'scripts/ship.sh': 'true\n' },
      publishing
    ),
    ['cli-usage-ratchet']
  );
  assert.deepEqual(planned(changed('scripts/ship.sh', 'D'), {}, publishing), [
    'cli-usage-ratchet',
  ]);
  assert.deepEqual(
    planned(
      changed('scripts/other.sh'),
      { 'scripts/other.sh': 'true\n' },
      publishing
    ),
    []
  );
});

test('an allowlist that cannot be read plans the guard, which reports it', () => {
  let reads = 0;
  const unreadable = (changes) =>
    cliUsageRatchetSteps(changes, {
      readCliAllowlist: () => {
        reads += 1;
        throw new SyntaxError('Unexpected end of JSON input');
      },
      readSource: () => 'const a = 1;\n',
    }).map((step) => step.id);
  assert.deepEqual(unreadable(changed('apps/web/src/a.ts')), [
    'cli-usage-ratchet',
  ]);
  assert.equal(reads, 1);
  // Nothing changed, nothing to plan: the allowlist is not even read.
  assert.deepEqual(unreadable([]), []);
  assert.equal(reads, 1);
});

test('the scanner and the allowlist select it; the guard test runs as a script test', () => {
  assert.deepEqual(planned(changed(SCANNER)), ['cli-usage-ratchet']);
  assert.deepEqual(planned(changed(ALLOWLIST)), ['cli-usage-ratchet']);
  assert.deepEqual(planned(changed(GUARD_TEST), { [GUARD_TEST]: CLI }), []);
});

test('a file that cannot be read is treated as a mention', () => {
  assert.deepEqual(planned(changed('scripts/unreadable.js')), [
    'cli-usage-ratchet',
  ]);
});

test('the step runs the guard test from the repository root', () => {
  const [step] = cliUsageRatchetSteps(changed(SCANNER), {
    readCliAllowlist: () => allowlist,
  });
  assert.equal(step.command, 'node');
  assert.deepEqual(step.args, ['--test', GUARD_TEST]);
  assert.equal(step.cwd, undefined);
  assert.equal(step.heavy, undefined);
  for (const file of [GUARD_TEST, SCANNER, ALLOWLIST])
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  assert.ok(step.fixHint.includes(ALLOWLIST));
  // The real allowlist has the shape the selection reads.
  const real = scanner.readAllowlist();
  assert.ok(Object.keys(real.files).length > 0);
  assert.equal(typeof real.publishCalls, 'object');
});

test('the gate plans the ratchet from the content of changed files', () => {
  const sources = {
    'scripts/check-changed/example.test.js': `'apps/web/${CLI}.jsonc'`,
    'scripts/check-changed/plain.test.js': "'apps/web/package.json'",
  };
  const context = {
    base: 'abc123',
    oxfmtBinary: '/repo/node_modules/.bin/oxfmt',
    branch: 'chore/gate',
    exists: () => false,
    hasVitest: () => true,
    readSource: (file) => sources[file] ?? '',
  };
  const ids = (file) =>
    planChecks(changed(file), context).steps.map((step) => step.id);
  assert.ok(
    ids('scripts/check-changed/example.test.js').includes('cli-usage-ratchet')
  );
  assert.equal(
    ids('scripts/check-changed/plain.test.js').includes('cli-usage-ratchet'),
    false
  );
  assert.equal(
    ids('apps/mobile/lib/main.dart').includes('cli-usage-ratchet'),
    false
  );
});

test('filtering the script tests away keeps the guard in a focused run', () => {
  const listed = (...flags) => {
    const logs = [];
    const result = main(
      ['--dry-run', '--no-ttr', ...flags, '--files', GUARD_TEST, SCANNER],
      { log: (line) => logs.push(line) }
    );
    assert.equal(result, 0, logs.join('\n'));
    return logs
      .filter(
        (line) => line.includes('node --test') && line.includes(GUARD_TEST)
      )
      .map((line) => line.trim().split(':')[0]);
  };
  // Unfiltered, the script tests run it and the dedicated step is dropped.
  assert.deepEqual(listed(), ['script-tests']);
  assert.deepEqual(listed('--only', 'cli-usage-ratchet'), [
    'cli-usage-ratchet',
  ]);
  assert.deepEqual(listed('--skip', 'script-tests'), ['cli-usage-ratchet']);
  assert.deepEqual(listed('--only', 'script-tests'), ['script-tests']);
});

test('the guard test runs once when it changes together with the scanner', () => {
  const context = {
    base: 'abc123',
    oxfmtBinary: '/repo/node_modules/.bin/oxfmt',
    branch: 'chore/gate',
    exists: (file) => file === GUARD_TEST,
    hasVitest: () => true,
    readSource: () => '',
  };
  const plan = (...files) =>
    withoutRepeatedGuard(
      planChecks(
        files.map((file) => ({ status: 'M', file })),
        context
      ).steps
    );
  // The steps that execute the guard test, as opposed to formatting it.
  const runsGuard = (steps) =>
    steps
      .filter(
        (step) =>
          step.command === 'node' &&
          step.args[0] === '--test' &&
          step.args.includes(GUARD_TEST)
      )
      .map((step) => step.id);

  // Both changed: the script tests run it, so the dedicated step is dropped.
  assert.deepEqual(runsGuard(plan(GUARD_TEST, SCANNER)), ['script-tests']);
  assert.deepEqual(runsGuard(plan(GUARD_TEST)), ['script-tests']);
  // The scanner alone has no sibling test, so only the dedicated step runs it.
  assert.deepEqual(runsGuard(plan(SCANNER)), ['cli-usage-ratchet']);
  assert.deepEqual(runsGuard(plan(ALLOWLIST)), ['cli-usage-ratchet']);
});

test('the gate wiring itself stays out of the allowlist', () => {
  // A mention here would make the ratchet fail on its own selection code.
  for (const file of [
    'scripts/check-changed/cli-usage-ratchet.js',
    'scripts/check-changed/cli-usage-ratchet.test.js',
    'scripts/check-changed/plan.js',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(countMentionLines(source), 0, file);
  }
});
