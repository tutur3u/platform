import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  hasCompletePassingTap,
  INVENTORY_SQL_FIXTURES,
  runInventoryContractTests,
} from '../../apps/database/scripts/inventory-contract-tests.mjs';
import { runIsolatedLifecycle } from '../../apps/database/scripts/run-supabase-isolated.js';

const metadata = {
  projectId: 'owned-project',
  disposableRoot: '/tmp/tuturuuu-supabase-owned',
  repositoryRoot: process.cwd(),
};
const passing = '1..2\nok 1 - assertion\nok 2 - assertion\n';

test('strict fixture results reject missing/empty plans, failures, duplicate or missing assertions', () => {
  assert.equal(hasCompletePassingTap(passing), true);
  for (const tap of [
    '1..1\nok 1 - skipped # SKIP\n',
    '1..1\nok 1 - pending # TODO\n',
    '1..1\nok 1 - assertion\nBail out! aborted\n',
    '1..1\nok 1 - assertion\n1..1\n',
    '',
    '1..0\n',
    '1..2\nok 1 - assertion\n',
    '1..2\nok 1 - assertion\nnot ok 2 - failure\n',
    '1..2\nok 1 - assertion\nok 1 - duplicate\n',
  ])
    assert.equal(hasCompletePassingTap(tap), false);
});

test('runs all focused SQL and owned concurrency before success', () => {
  const calls = [];
  const result = runInventoryContractTests(metadata, {
    execute: (...args) => {
      calls.push(args);
      return passing;
    },
    log: () => {},
  });
  assert.deepEqual(result, { code: 0 });
  assert.equal(
    calls.filter(([cmd, args]) => cmd === 'docker' && args[0] === 'exec')
      .length,
    6
  );
  const copied = calls.filter(
    ([cmd, args]) => cmd === 'docker' && args[0] === 'cp'
  );
  assert.deepEqual(
    copied.map(([, args]) => path.basename(args[1])),
    INVENTORY_SQL_FIXTURES
  );
  assert.deepEqual(
    calls
      .filter(([cmd]) => cmd === process.execPath)
      .map(([, args]) => path.basename(args[0])),
    [
      'inventory-merge-concurrency.mjs',
      'inventory-season-merge-concurrency.mjs',
    ]
  );
  const [command, args, options] = calls.at(-1);
  assert.equal(command, process.execPath);
  assert.equal(
    args[0],
    path.resolve(
      metadata.repositoryRoot,
      'apps/database/supabase/tests/inventory-season-merge-concurrency.mjs'
    )
  );
  assert.equal(args[1], metadata.disposableRoot);
  assert.equal(options.cwd, metadata.repositoryRoot);
  assert.equal(options.timeout, 120000);
});

test('failed SQL cannot run concurrency or become a passing gate', () => {
  const calls = [];
  assert.deepEqual(
    runInventoryContractTests(metadata, {
      execute: (...args) => {
        calls.push(args);
        return '1..1\nnot ok 1 - failure\n';
      },
      log: () => {},
    }),
    { code: 1 }
  );
  assert.equal(calls.length, 2);
});

test('actual lifecycle cleans its owned stack when concurrency executor throws', async () => {
  const stages = [];
  let removed = false;
  const code = await runIsolatedLifecycle({
    binaryPath: 'supabase',
    metadata,
    registerSignals: () => () => {},
    updateMetadata: async () => {},
    removeRoot: async () => {
      removed = true;
    },
    stderr: { write: () => {} },
    runner: async (_cmd, args) => {
      stages.push(args);
      if (args.includes('test'))
        return runInventoryContractTests(metadata, {
          execute: (cmd) => {
            if (cmd === process.execPath)
              throw new Error('Concurrent writer failed');
            return passing;
          },
          log: () => {},
        });
      return { code: 0 };
    },
  });
  assert.equal(code, 1);
  assert.equal(stages.at(-1).includes('stop'), true);
  assert.equal(stages.at(-1).includes('--no-backup'), true);
  assert.equal(removed, true);
});

test('existing CI lane triggers on changed SQL or concurrent executor and owns one lifecycle', () => {
  const workflow = readFileSync(
    '.github/workflows/inventory-offline-contract.yaml',
    'utf8'
  );
  assert.match(workflow, /apps\/database\/supabase\/tests\/inventory-\*\.sql/);
  assert.match(
    workflow,
    /apps\/database\/supabase\/tests\/inventory-merge-concurrency\.mjs/
  );
  assert.match(
    workflow,
    /apps\/database\/scripts\/inventory-contract-tests\.mjs/
  );
  assert.equal(
    (
      workflow.match(
        /run: node apps\/database\/scripts\/verify-inventory-offline-contract.mjs/g
      ) ?? []
    ).length,
    1
  );
});
