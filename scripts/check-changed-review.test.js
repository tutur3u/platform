const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, ttrPrefix } = require('./check-changed.js');
const { planChecks } = require('./check-changed/plan.js');
const { trustedTtr } = require('./trusted-ttr.js');

test('a missing global CLI warns and selects sequential execution', () => {
  const warnings = [];
  assert.equal(
    ttrPrefix(
      true,
      () => assert.fail('must not probe PATH'),
      {},
      () => {
        throw Object.assign(new Error('global absent'), {
          code: 'TTR_GLOBAL_NOT_INSTALLED',
        });
      },
      (line) => warnings.push(line)
    ),
    null
  );
  assert.match(warnings.join('\n'), /sequentially/);
  assert.match(warnings.join('\n'), /bun add -g tuturuuu/);
});

for (const cause of [
  Object.assign(new Error('target missing'), { code: 'ENOENT' }),
  new Error('target missing', { cause: { code: 'ENOENT' } }),
]) {
  test(`unclassified ${cause.cause ? 'nested' : 'direct'} ENOENT refuses sequential fallback`, () => {
    assert.throws(
      () =>
        ttrPrefix(
          true,
          () => assert.fail('must not probe'),
          {},
          () => {
            throw cause;
          },
          () => assert.fail('must not warn as absent')
        ),
      /target missing/
    );
  });
}

test('an untrusted installed global CLI still refuses admission', () => {
  assert.throws(
    () =>
      ttrPrefix(
        true,
        () => assert.fail('must not probe'),
        {},
        () => {
          throw new Error('requires stable version >= 0.28.0');
        }
      ),
    /requires stable version/
  );
});

const head = 'a'.repeat(40);
const push = (branch, sha = head) =>
  `refs/heads/tmp/agent ${sha} refs/heads/${branch} ${'0'.repeat(40)}\n`;
function hook(stdin, upstream = 'refs/remotes/origin/fix/routing') {
  const logs = [];
  const tracking = [];
  const code = main(
    ['--hook', '--no-ttr', '--only', 'branch-name', '--files', 'README.md'],
    {
      stdin,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: (_command, args) => {
        if (args[0] === 'config') return 'true';
        if (args[0] === 'rev-parse') return head;
        if (args[0] === 'status') return '';
        if (args[0] === 'merge-base') return 'base';
        if (args[0] === 'branch') return 'tmp/agent';
        if (args[0] === 'for-each-ref') {
          tracking.push(args);
          return args[1].includes(':remoteref')
            ? upstream.startsWith('refs/remotes/')
              ? 'refs/heads/fix/routing'
              : ''
            : upstream;
        }
        throw new Error(`Unexpected git arguments: ${args.join(' ')}`);
      },
      log: (line) => logs.push(line),
    }
  );
  return { code, logs: logs.join('\n'), tracking };
}

for (const upstream of [
  'refs/remotes/origin/fix/routing',
  'refs/heads/fix/local',
]) {
  test(`hook refuses a published tmp branch despite tracking ${upstream}`, () => {
    const result = hook(push('tmp/agent'), upstream);
    assert.equal(result.code, 1);
    assert.match(result.logs, /invalid pushed branch.*tmp\/agent/i);
    assert.deepEqual(result.tracking, []);
  });
  test(`hook validates the actual valid publication with tracking ${upstream}`, () => {
    const result = hook(push('fix/publication'), upstream);
    assert.equal(result.code, 0);
    assert.match(result.logs, /branch name fix\/publication/);
    assert.deepEqual(result.tracking, []);
  });
}

test('hook validates every pushed branch, even a non-HEAD ref', () => {
  assert.equal(
    hook(push('fix/good') + push('tmp/bad', 'b'.repeat(40))).code,
    1
  );
  assert.equal(hook(push('fix/first') + push('chore/second')).code, 0);
});

test('hook ignores deleted branch names and never validates tags as branches', () => {
  assert.equal(
    hook(push('tmp/deleted', '0'.repeat(40)) + push('fix/good')).code,
    0
  );
  const tag = hook(
    `refs/tags/tmp/tag ${head} refs/tags/tmp/tag ${'0'.repeat(40)}\n`
  );
  assert.equal(tag.code, 0);
  assert.match(tag.logs, /no pushed branch refs/);
  assert.deepEqual(tag.tracking, []);
});

test('without push refs a temporary branch can track a local publication branch', () => {
  const logs = [];
  assert.equal(
    main(['--no-ttr', '--only', 'branch-name', '--files', 'README.md'], {
      execFile: (_command, args) => {
        if (args[0] === 'merge-base') return 'base';
        if (args[0] === 'branch') return 'tmp/agent';
        if (args[0] === 'for-each-ref')
          return args[1].includes(':remoteref') ? '' : 'refs/heads/fix/local';
        throw new Error(`Unexpected git arguments: ${args.join(' ')}`);
      },
      log: (line) => logs.push(line),
    }),
    0
  );
  assert.match(
    logs.join('\n'),
    /branch name fix\/local \(tracking for tmp\/agent\)/
  );
});

test('a deleted script still selects its surviving sibling test', () => {
  const plan = planChecks([{ status: 'D', file: 'scripts/deleted.js' }], {
    branch: 'fix/routing',
    exists: (file) => file === 'scripts/deleted.test.js',
    hasVitest: () => false,
  });
  assert.ok(
    plan.steps
      .find((step) => step.id === 'script-tests')
      ?.args.includes('scripts/deleted.test.js')
  );
});

test('main without a global CLI executes the selected check sequentially', (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'changed-no-global-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(
    path.join(root, 'scripts/probe.test.js'),
    "require('node:test')('ok', () => {});"
  );
  const logs = [];
  let ran = false;
  assert.equal(
    main(['--only', 'script-tests', '--files', 'scripts/probe.test.js'], {
      root,
      env: { HOME: root },
      resolveCli: () => trustedTtr(root, root),
      execFile: (_command, args) => {
        if (args[0] === 'merge-base') return 'base';
        if (args[0] === 'branch') return 'fix/routing';
        throw new Error('must not invoke a workspace or PATH ttr');
      },
      log: (line) => logs.push(line),
      spawn: (command, args) => {
        assert.equal(command, 'node');
        assert.ok(args.includes('scripts/probe.test.js'));
        ran = true;
        return { status: 0 };
      },
    }),
    0
  );
  assert.equal(ran, true);
  assert.match(logs.join('\n'), /sequentially/);
});
