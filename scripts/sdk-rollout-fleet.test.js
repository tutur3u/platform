const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  main,
  workerRequest,
  readCompletion,
  completionReceipt,
  remoteTimeoutMs,
  operationBudgetMs,
} = require('./sdk-rollout');
const identity = {
  version: '0.28.1-dev.1.abcdef0',
  sha256: '0'.repeat(64),
  tarball: '/fixture.tgz',
};
const qualified = {
  schemaVersion: 1,
  status: 'qualified',
  rollback: 'not-needed',
  backup: '/private/backup',
};
const remote = '/tmp/ttr-rollout.ABCDEFGHIJ';
function payloadFrom(command) {
  const encoded = command.match(/--worker '([^']+)'/)[1];
  return JSON.parse(Buffer.from(encoded, 'base64url').toString());
}
test('remote timeout includes bounded drain plus an explicit operation budget', () => {
  assert.equal(operationBudgetMs, 30 * 60 * 1000);
  assert.equal(remoteTimeoutMs(0), operationBudgetMs);
  assert.equal(remoteTimeoutMs(3600), 3600_000 + operationBudgetMs);
  assert.ok(remoteTimeoutMs(3600) > 300_000);
});
test('worker persists a matching terminal receipt only after the engine finishes', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'rollout-worker-report-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const payload = { ...identity, operationId: 'a'.repeat(32) };
  const file = path.join(directory, 'worker-report.json');
  const result = await workerRequest(
    payload,
    async () => {
      assert.equal(fs.existsSync(file), false);
      return qualified;
    },
    directory
  );
  assert.deepEqual(result, qualified);
  assert.deepEqual(
    readCompletion(fs.readFileSync(file, 'utf8'), payload),
    qualified
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(
    () =>
      readCompletion(fs.readFileSync(file, 'utf8'), {
        ...payload,
        operationId: 'b'.repeat(32),
      }),
    /does not match/
  );
  fs.rmSync(file);
  await assert.rejects(
    workerRequest(
      payload,
      async () => {
        throw new Error('engine uncertain');
      },
      directory
    ),
    /uncertain/
  );
  assert.equal(fs.existsSync(file), false);
});
test('lost SSH response reconciles the completed remote report without replaying installation', async () => {
  let payload;
  let launches = 0;
  let reportReads = 0;
  let observedTimeout;
  const result = await main(
    ['--channel', 'dev', '--host', 'host-a', '--wait-drain', '3600'],
    {
      candidate: async () => identity,
      run: async (command, args, options = {}) => {
        if (command === 'scp') return '';
        const shell = args.at(-1);
        if (shell.includes('mktemp')) return remote;
        if (shell.includes('--worker')) {
          launches++;
          payload = payloadFrom(shell);
          observedTimeout = options.timeoutMs;
          throw new Error('connection lost after completion');
        }
        if (shell.includes('cat --')) {
          reportReads++;
          assert.equal(options.timeoutMs, 10_000);
          return JSON.stringify(completionReceipt(payload, qualified));
        }
        if (shell.includes('rm -rf')) return '';
        throw new Error('unexpected command');
      },
    }
  );
  assert.equal(observedTimeout, remoteTimeoutMs(3600));
  assert.equal(launches, 1);
  assert.equal(reportReads, 1);
  assert.equal(result.status, 'qualified');
  assert.equal(result.reports[0].reconciled, true);
  assert.equal(result.reports[0].backup, '/private/backup');
  assert.match(result.reports[0].transportError, /connection lost/);
});
test('nonterminal or mismatched report keeps the host unknown and remaining hosts skipped', async (t) => {
  let payload;
  let launches = 0;
  const result = await main(
    ['--channel', 'dev', '--host', 'host-a', '--host', 'host-b'],
    {
      candidate: async () => identity,
      run: async (command, args) => {
        if (command === 'scp') return '';
        const shell = args.at(-1);
        if (shell.includes('mktemp')) return remote;
        if (shell.includes('--worker')) {
          launches++;
          payload = payloadFrom(shell);
          throw new Error('transport lost');
        }
        if (shell.includes('cat --'))
          return JSON.stringify({
            ...completionReceipt(payload, qualified),
            complete: false,
          });
        throw new Error('Unknown staging must be retained');
      },
    }
  );
  t.after(() => fs.rmSync(result.staging, { recursive: true, force: true }));
  assert.equal(launches, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.reports[0].status, 'unknown');
  assert.equal(result.reports[0].reportFile, `${remote}/worker-report.json`);
  assert.equal(result.reports[1].status, 'skipped');
});
test('rollback failure cannot be reported as qualified even when worker status claims success', async (t) => {
  const result = await main(
    ['--channel', 'dev', '--host', 'host-a', '--host', 'host-b'],
    {
      candidate: async () => identity,
      run: async (command, args) => {
        if (command === 'scp') return '';
        const shell = args.at(-1);
        if (shell.includes('mktemp')) return remote;
        if (shell.includes('--worker'))
          return JSON.stringify({ ...qualified, rollback: 'failed' });
        throw new Error('Failed rollback must retain staging');
      },
    }
  );
  t.after(() => fs.rmSync(result.staging, { recursive: true, force: true }));
  assert.equal(result.status, 'failed');
  assert.equal(result.reports[0].status, 'failed');
  assert.equal(result.reports[0].rollback, 'failed');
  assert.equal(result.reports[1].status, 'skipped');
});
test('candidate refusal lists every target as skipped without contacting a host', async () => {
  const result = await main(
    ['--channel', 'dev', '--host', 'host-a', '--host', 'host-b'],
    {
      candidate: async () => {
        throw new Error('checksum mismatch');
      },
      run: async () => {
        throw new Error('must not contact host');
      },
    }
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'checksum mismatch');
  assert.deepEqual(
    result.reports.map(({ status }) => status),
    ['skipped', 'skipped']
  );
});

test('staging cleanup failure preserves the original preparation error', async (t) => {
  const remove = fs.rmSync;
  fs.rmSync = (target, options) => {
    if (String(target).includes('ttr-rollout-'))
      throw new Error('cleanup refused');
    return remove(target, options);
  };
  t.after(() => {
    fs.rmSync = remove;
  });
  const result = await main(['--channel', 'dev', '--host', 'host-a'], {
    candidate: async () => {
      throw new Error('original checksum failure');
    },
  });
  fs.rmSync = remove;
  t.after(() => remove(result.staging, { recursive: true, force: true }));
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'original checksum failure');
  assert.equal(result.cleanupError, 'cleanup refused');
  assert.equal(result.reports[0].status, 'skipped');
});
