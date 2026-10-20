import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import {
  emitChildDiagnostics,
  receiptError,
} from './native-wrangler-diagnostics.mjs';
import {
  casePhaseSummary,
  classifyChildReceipt,
  createChildProducer,
  finalizeObservedCase,
  observeCaseReceipt,
  observeStartupFailure,
} from './native-wrangler-evidence.mjs';
import { finalizerFixture } from './native-wrangler-finalizer.fixture.mjs';
import {
  assertIntendedSyntax,
  observeOwnedChild,
  spawnOwnedFixture,
  syntaxClosed,
  syntaxPending,
} from './native-wrangler-observable.mjs';
import { sealArtifact } from './native-wrangler-runtime.mjs';

const invalidSource = 'export default = ;';
function compilerGraph(plan) {
  const compiler = Object.assign(new Error('Build failed with 1 error:'), {
    errors: [
      {
        text: 'Unexpected "="',
        notes: [],
        location: {
          file: plan.copyMain,
          line: 1,
          column: 15,
          lineText: invalidSource,
        },
      },
    ],
  });
  const startup = new Error('An error occurred when starting the server', {
    cause: compiler,
  });
  startup.stack += '\n    at startWorker (public-sdk.mjs:1:1)';
  return new Error(
    `Public SDK startup rejected; scratch retained: ${plan.scratch}`,
    {
      cause: startup,
    }
  );
}
async function syntaxFixture(run) {
  await finalizerFixture(async (plan) => {
    plan.copyMain = join(plan.copyRoot, 'main.mjs');
    plan.copyConfig = join(plan.copyRoot, 'wrangler.json');
    for (const path of [join(plan.root, 'main.mjs'), plan.copyMain])
      await writeFile(path, invalidSource);
    plan.seal = await sealArtifact(plan.root);
    await run(plan);
  });
}
async function receiptFor(plan, change = () => {}) {
  const producer = createChildProducer('syntax');
  const graph = compilerGraph(plan);
  change(graph);
  let primary;
  try {
    await observeStartupFailure(
      producer,
      async () => {
        throw graph;
      },
      'syntax',
      (error) => assertIntendedSyntax(error, plan)
    );
  } catch (error) {
    primary = error;
  }
  return (await producer.finish(primary)).receipt;
}
const closed = () => ({
  code: 1,
  signal: null,
  closeObserved: true,
  stdioDrained: true,
  intervened: false,
});
async function orchestrate(plan, receipt, outcome = closed(), remove) {
  const receiptFile = join(plan.caseRoot, 'child-receipt.json');
  if (receipt) await writeFile(receiptFile, JSON.stringify(receipt));
  const gates = [];
  const observation = await observeCaseReceipt(
    receiptFile,
    'syntax',
    outcome,
    plan,
    gates
  );
  const context = { name: 'syntax', outcome, ...observation };
  const result = await finalizeObservedCase(plan, gates, context, remove);
  return { result, gates, context };
}
function summary({ result, context }, persisted = true) {
  return casePhaseSummary(
    'syntax',
    context.receipt,
    context.outcome,
    context.classification,
    result,
    persisted,
    context.receiptStatus
  );
}
async function assertRetained(plan, result) {
  await realpath(plan.scratch);
  assert.ok(result.errors.length);
  if (result.snapshot) {
    const bytes = await readFile(
      join(
        result.snapshot.path,
        'case/temp/declared-scratch/artifact/main.mjs'
      ),
      'utf8'
    );
    assert.equal(bytes, await readFile(plan.copyMain, 'utf8'));
    const record = JSON.parse(
      await readFile(
        join(result.snapshot.path, 'parent-finalization.json'),
        'utf8'
      )
    );
    assert.ok(record.errors.length);
  }
}

test('owned child requires close after both output streams drain, never merely exit', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
  });
  const output = [];
  let settled = false;
  const observed = observeOwnedChild(child, (name, chunk) =>
    output.push([name, String(chunk)])
  );
  observed.then(() => {
    settled = true;
  });
  child.emit('exit', 1, null);
  await Promise.resolve();
  assert.equal(settled, false);
  child.stdout.end('last-out');
  child.stderr.end('last-err');
  await Promise.all(
    [child.stdout, child.stderr].map(
      (stream) => new Promise((resolve) => stream.once('end', resolve))
    )
  );
  child.emit('close', 1, null);
  assert.deepEqual(await observed, { ...closed(), error: undefined });
  assert.deepEqual(output, [
    ['stdout', 'last-out'],
    ['stderr', 'last-err'],
  ]);
});

test('natural owned Node child qualifies only after receipt, verified snapshot, removal and persistence', async () => {
  await syntaxFixture(async (plan) => {
    const output = { stdout: 0, stderr: 0 };
    const entry = join(plan.caseRoot, 'natural-child.mjs');
    await writeFile(
      entry,
      "process.stdout.write('x'.repeat(262144)); process.stderr.write('y'.repeat(262144)); process.exitCode = 1;"
    );
    const outcome = await spawnOwnedFixture(
      {
        entry,
        cwd: plan.caseRoot,
        name: 'syntax',
        planFile: join(plan.caseRoot, 'parent-plan.json'),
        receiptFile: join(plan.caseRoot, 'child-receipt.json'),
        tempRoot: plan.tempRoot,
      },
      (name, chunk) => {
        output[name] += chunk.length;
      }
    );
    assert.deepEqual(output, { stdout: 262144, stderr: 262144 });
    const observed = await orchestrate(plan, await receiptFor(plan), outcome);
    assert.deepEqual(observed.gates, []);
    assert.deepEqual(observed.result.errors, []);
    assert.equal(observed.context.classification, syntaxPending);

    for (const phase of [
      'residual',
      'originalSeal',
      'copySeal',
      'foreign',
      'snapshot',
      'removal',
    ]) {
      const incomplete = {
        ...observed,
        result: {
          ...observed.result,
          phases: { ...observed.result.phases, [phase]: undefined },
        },
      };
      assert.ok(!summary(incomplete).includes(syntaxClosed), phase);
    }
    for (const snapshot of [
      undefined,
      {},
      { path: observed.result.snapshot.path },
    ])
      assert.ok(
        !summary({
          ...observed,
          result: { ...observed.result, snapshot },
        }).includes(syntaxClosed)
      );
    const line = summary(observed);
    assert.ok(line.includes(`classification=${syntaxClosed}`));
    assert.ok(line.includes('internalCleanup=UNKNOWN'));
    assert.ok(line.includes('descendantClosure=UNKNOWN'));
    assert.ok(!summary(observed, false).includes(syntaxClosed));
    await assert.rejects(realpath(plan.scratch), { code: 'ENOENT' });
    const original = await readFile(
      join(observed.result.snapshot.path, 'case/original/main.mjs'),
      'utf8'
    );
    assert.equal(original, invalidSource);
    const persisted = JSON.parse(
      await readFile(join(plan.caseRoot, 'parent-finalization.json'), 'utf8')
    );
    assert.equal(persisted.phases.removal.ok, true);
    assert.equal(persisted.snapshot.seal, observed.result.snapshot.seal);
  });
});

test('wrong syntax target, diagnostic and extra error graphs fail through producer and parent receipt', async () => {
  const variants = {
    text: (e) => {
      e.cause.cause.errors[0].text = 'Unexpected ";"';
    },
    line: (e) => {
      e.cause.cause.errors[0].location.line = 2;
    },
    column: (e) => {
      e.cause.cause.errors[0].location.column = 14;
    },
    source: (e) => {
      e.cause.cause.errors[0].location.lineText = 'export default {};';
    },
    file: (e) => {
      e.cause.cause.errors[0].location.file += '.other';
    },
    extraCompiler: (e) => {
      e.cause.cause.errors.push({ text: 'teardown failed' });
    },
    extraStartup: (e) => {
      e.cause.errors = [new Error('teardown failed')];
    },
    extraRoot: (e) => {
      e.errors = [new Error('unrelated')];
    },
    extraCause: (e) => {
      e.cause.cause.cause = new Error('teardown failed');
    },
    aggregate: (e) => {
      e.cause = new AggregateError([e.cause, new Error('teardown failed')]);
    },
  };
  for (const [name, change] of Object.entries(variants)) {
    await syntaxFixture(async (plan) => {
      const receipt = await receiptFor(plan, change);
      assert.equal(receipt.facts.predicateMatched, false, name);
      const observed = await orchestrate(plan, receipt);
      assert.ok(observed.gates.length, name);
      assert.ok(!summary(observed).includes(syntaxClosed), name);
      await assertRetained(plan, observed.result);
    });
  }
});

test('valid module with returned Worker cannot qualify as intentional pre-return syntax rejection', async () => {
  await finalizerFixture(async (plan) => {
    plan.copyMain = join(plan.copyRoot, 'main.mjs');
    assert.equal(await readFile(plan.copyMain, 'utf8'), 'export default {};');
    const producer = createChildProducer('syntax');
    await assert.rejects(
      observeStartupFailure(
        producer,
        async () => ({
          worker: { ready: Promise.resolve() },
        }),
        'syntax',
        (e) => assertIntendedSyntax(e, plan)
      )
    );
    const { receipt } = await producer.finish();
    assert.equal(receipt.facts.workerReturned, true);
    const observed = await orchestrate(plan, receipt);
    assert.ok(!summary(observed).includes(syntaxClosed));
    await assertRetained(plan, observed.result);
  });
});

test('missing receipt and every incomplete or intervened child observation retain evidence', async () => {
  const variants = [
    ['receipt', closed()],
    ['close', { ...closed(), closeObserved: false }],
    ['stdio', { ...closed(), stdioDrained: false }],
    ['signal', { ...closed(), signal: 'SIGTERM' }],
    ['watchdog', { ...closed(), intervened: true }],
    ['exit0', { ...closed(), code: 0 }],
    ['diagnosticFailure', { ...closed(), code: 2 }],
    ['spawnError', { ...closed(), error: new Error('spawn failed') }],
    ['absent', undefined],
  ];
  for (const [name, outcome] of variants) {
    await syntaxFixture(async (plan) => {
      const receipt = name === 'receipt' ? undefined : await receiptFor(plan);
      // Explicit null represents no observation; the helper's default is intentional.
      const observed = await orchestrate(plan, receipt, outcome ?? null);
      assert.ok(observed.gates.length, name);
      assert.ok(!summary(observed).includes(syntaxClosed), name);
      assert.equal(observed.result.phases.removal, undefined);
      await assertRetained(plan, observed.result);
    });
  }
});

test('each independent closure proof fails closed through the real parent finalizer', async () => {
  for (const phase of [
    'residual',
    'originalSeal',
    'copySeal',
    'foreign',
    'snapshot',
    'removal',
  ]) {
    await syntaxFixture(async (plan) => {
      const receipt = await receiptFor(plan);
      if (phase === 'residual')
        await writeFile(join(plan.tempRoot, 'residual'), 'owned sentinel');
      if (phase === 'originalSeal')
        await writeFile(join(plan.root, 'main.mjs'), 'mutated original');
      if (phase === 'copySeal') await writeFile(plan.copyMain, 'mutated copy');
      if (phase === 'foreign')
        await writeFile(plan.foreignPath, 'foreign mutation');
      if (phase === 'snapshot')
        plan.diagnosticRoot = join(plan.caseRoot, 'missing-diagnostics');
      const observed = await orchestrate(
        plan,
        receipt,
        closed(),
        phase === 'removal' ? async () => {} : undefined
      );
      assert.equal(observed.result.phases[phase].ok, false, phase);
      assert.ok(!summary(observed).includes(syntaxClosed), phase);
      await assertRetained(plan, observed.result);
      if (phase === 'snapshot')
        assert.equal(observed.result.snapshot, undefined);
      else assert.ok(observed.result.snapshot?.seal);
    });
  }
});

test('post-removal persistence failure throws and retains verified pre-removal bytes and errors', async () => {
  await syntaxFixture(async (plan) => {
    await mkdir(join(plan.caseRoot, 'parent-finalization.json'));
    await assert.rejects(orchestrate(plan, await receiptFor(plan)));
    await assert.rejects(realpath(plan.scratch), { code: 'ENOENT' });
    // The snapshot destination is independent of the failed parent destination.
    const { readdir } = await import('node:fs/promises');
    const [snapshot] = await readdir(plan.diagnosticRoot);
    const root = join(plan.diagnosticRoot, snapshot);
    assert.equal(
      await readFile(
        join(root, 'case/temp/declared-scratch/artifact/main.mjs'),
        'utf8'
      ),
      invalidSource
    );
    const record = JSON.parse(
      await readFile(join(root, 'parent-finalization.json'), 'utf8')
    );
    assert.ok(record.persistenceErrors.length);
    assert.equal(record.phases.removal.ok, true);
  });
});

test('post-receipt child diagnostic failure exits distinctly and cannot pass parent closure', async () => {
  await syntaxFixture(async (plan) => {
    const tempRoot = join(plan.caseRoot, 'native-sdk-temp');
    await mkdir(tempRoot);
    const entry = join(plan.caseRoot, 'diagnostic-failure-child.mjs');
    const evidence = new URL('./native-wrangler-evidence.mjs', import.meta.url)
      .href;
    const observable = new URL(
      './native-wrangler-observable.mjs',
      import.meta.url
    ).href;
    const receiptFile = join(plan.caseRoot, 'child-receipt.json');
    await writeFile(
      entry,
      `
      import { createChildProducer, observeStartupFailure, runChildFixture } from ${JSON.stringify(evidence)};
      import { assertIntendedSyntax } from ${JSON.stringify(observable)};
      const plan = ${JSON.stringify(plan)};
      const invalidSource = ${JSON.stringify(invalidSource)};
      const graph = (${compilerGraph.toString()})(plan);
      const producer = createChildProducer('syntax');
      console.log = () => { throw new Error('diagnostic writer failed after receipt'); };
      await runChildFixture({ name: 'syntax', producer, plan: () => plan, receiptFile: ${JSON.stringify(receiptFile)},
        cases: { syntax: () => observeStartupFailure(producer, async () => { throw graph; }, 'syntax',
          error => assertIntendedSyntax(error, plan)) }
      });
    `
    );
    const outcome = await spawnOwnedFixture({
      entry,
      cwd: plan.caseRoot,
      name: 'syntax',
      planFile: '',
      receiptFile,
      tempRoot,
    });
    assert.equal(outcome.code, 2);
    assert.equal(outcome.closeObserved, true);
    assert.equal(outcome.stdioDrained, true);
    const gates = [];
    const context = {
      name: 'syntax',
      outcome,
      ...(await observeCaseReceipt(
        receiptFile,
        'syntax',
        outcome,
        plan,
        gates
      )),
    };
    assert.equal(context.receiptStatus, 'ok');
    assert.ok(gates.length);
    const result = await finalizeObservedCase(plan, gates, context);
    assert.ok(!summary({ context, result }).includes(syntaxClosed));
    await assertRetained(plan, result);
    const faults = JSON.parse(
      await readFile(
        join(result.snapshot.path, 'case/child-diagnostic-faults.json'),
        'utf8'
      )
    );
    assert.ok(
      JSON.stringify(faults).includes('diagnostic writer failed after receipt')
    );
  });
});

test('observer retains spawn/output errors and distinguishes closed pipes from drained output', async () => {
  for (const mode of ['spawn', 'output', 'undrained', 'intervention']) {
    await syntaxFixture(async (plan) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        killed: mode === 'intervention',
      });
      const failure = new Error(`owned child ${mode}`);
      const observation = observeOwnedChild(child, () => {
        if (mode === 'output') throw failure;
      });
      if (mode === 'spawn') child.emit('error', failure);
      if (mode === 'undrained') {
        child.stdout.destroy();
        child.stderr.destroy();
      } else {
        child.stdout.end('output');
        child.stderr.end('error output');
        await Promise.all(
          [child.stdout, child.stderr].map(
            (stream) => new Promise((resolve) => stream.once('end', resolve))
          )
        );
      }
      child.emit('close', 1, null);
      const outcome = await observation;
      if (['spawn', 'output'].includes(mode))
        assert.equal(outcome.error, failure);
      if (mode === 'undrained') assert.equal(outcome.stdioDrained, false);
      if (mode === 'intervention') assert.equal(outcome.intervened, true);
      const observed = await orchestrate(plan, await receiptFor(plan), outcome);
      assert.ok(observed.gates.length);
      assert.ok(!summary(observed).includes(syntaxClosed));
      await assertRetained(plan, observed.result);
    });
  }
});

test('dedicated preload outcome stays distinct from observable syntax closure', async () => {
  await syntaxFixture(async (plan) => {
    const producer = createChildProducer('preload');
    const error = Object.assign(
      new Error('Preloaded Wrangler SDK unsupported'),
      { code: 'ERR_ASSERTION' }
    );
    await producer.expectPreload(async () => {
      throw error;
    });
    const { receipt } = await producer.finish();
    const { requireChildOutcome } = await import(
      './native-wrangler-evidence.mjs'
    );
    assert.equal(
      requireChildOutcome(receipt, 'preload', { code: 0, signal: null }),
      'PROVEN_PRESTART_PRELOAD_REJECTION'
    );
    const observed = await orchestrate(plan, receipt);
    assert.equal(observed.context.receiptStatus, 'fail');
    assert.ok(!summary(observed).includes(syntaxClosed));
    await assertRetained(plan, observed.result);
  });
});

test('real owned child preserves falsy forwarding failures and blocks removal', async () => {
  for (const failure of [undefined, null, false, 0, '', NaN]) {
    await syntaxFixture(async (plan) => {
      const entry = join(plan.caseRoot, 'falsy-forwarding-child.mjs');
      await writeFile(
        entry,
        "process.stdout.write('stdout'); process.stderr.write('stderr'); process.exitCode = 1;"
      );
      const outcome = await spawnOwnedFixture(
        {
          entry,
          cwd: plan.caseRoot,
          name: 'syntax',
          planFile: '',
          receiptFile: '',
          tempRoot: plan.tempRoot,
        },
        () => {
          throw failure;
        }
      );
      assert.equal(outcome.code, 1);
      assert.equal(outcome.closeObserved, true);
      assert.equal(outcome.stdioDrained, true);
      assert.ok(outcome.error instanceof Error);
      assert.equal(outcome.error.message, 'Owned child observation failed');
      assert.ok(Object.hasOwn(outcome.error, 'cause'));
      assert.ok(Object.is(outcome.error.cause, failure));
      const observed = await orchestrate(plan, await receiptFor(plan), outcome);
      assert.ok(observed.gates.length);
      assert.ok(!summary(observed).includes(syntaxClosed));
      assert.equal(observed.result.phases.removal, undefined);
      await assertRetained(plan, observed.result);
      assert.ok(observed.result.snapshot?.seal);
    });
  }
});

test('supplier-relative compiler filename qualifies only from copied config directory', async () => {
  await syntaxFixture(async (plan) => {
    const receipt = await receiptFor(plan, (error) => {
      error.cause.cause.errors[0].location.file = relative(
        dirname(plan.copyConfig),
        plan.copyMain
      );
    });
    const observed = await orchestrate(plan, receipt);
    assert.deepEqual(observed.gates, []);
    assert.ok(summary(observed).includes(syntaxClosed));
    const escaped = compilerGraph(plan);
    escaped.cause.cause.errors[0].location.file = '../main.mjs';
    assert.throws(() => assertIntendedSyntax(escaped, plan));
  });
});

test('extra supplier detail fault fails qualification and survives retained diagnostics', async () => {
  await syntaxFixture(async (plan) => {
    const graph = compilerGraph(plan);
    graph.cause.cause.errors[0].detail = new AggregateError([
      new Error('unrelated supplier detail fault'),
    ]);
    const producer = createChildProducer('syntax');
    let primary;
    try {
      await observeStartupFailure(
        producer,
        async () => {
          throw graph;
        },
        'syntax',
        (error) => assertIntendedSyntax(error, plan)
      );
    } catch (error) {
      primary = error;
    }
    const { receipt, errors } = await producer.finish(primary);
    assert.equal(receipt.facts.predicateMatched, false);
    await emitChildDiagnostics(
      { receipt, errors, plan },
      {
        writePrivate: (name, bytes) =>
          writeFile(join(plan.caseRoot, name), bytes),
        writeReceipt: (bytes) =>
          writeFile(join(plan.caseRoot, 'child-receipt.json'), bytes),
        classify: classifyChildReceipt,
        writeLine: () => {},
        writeFailure: () => {},
      }
    );
    const observed = await orchestrate(plan, receipt);
    assert.ok(observed.gates.length);
    assert.ok(!summary(observed).includes(syntaxClosed));
    await assertRetained(plan, observed.result);
    const retained = JSON.parse(
      await readFile(
        join(observed.result.snapshot.path, 'case/child-phase-errors.json'),
        'utf8'
      )
    );
    const detail = retained.startup.cause.cause.errors[0].detail;
    assert.equal(detail.name, 'AggregateError');
    assert.equal(detail.errors[0].message, 'unrelated supplier detail fault');
  });
});

test('syntax consumer accepts the producer graph format and rejects misleading roots', async () => {
  await syntaxFixture(async (plan) => {
    const receipt = await receiptFor(plan);
    assert.deepEqual(receipt.startup, receiptError(compilerGraph(plan)));
    assert.equal(
      /^Public SDK startup rejected; scratch retained: .+$/.test(
        receipt.startup.message
      ),
      false
    );
    assert.equal(classifyChildReceipt(receipt, 'syntax'), syntaxPending);
    const observed = await orchestrate(plan, receipt);
    assert.deepEqual(observed.gates, []);
    assert.equal(observed.result.phases.removal.ok, true);
    assert.ok(summary(observed).includes(syntaxClosed));
    await assert.rejects(realpath(plan.scratch), { code: 'ENOENT' });
  });
  const graphChanges = [
    (error) => Object.assign(error, { message: 'Unrelated startup' }),
    (error) => Object.defineProperty(error, 'message', { value: undefined }),
    (error) => Object.assign(error, { name: 'OtherError' }),
    (error) => Object.defineProperty(error, 'name', { value: undefined }),
    (error) => Object.assign(error, { message: `${error.message}\nError` }),
  ];
  for (const change of graphChanges) {
    await syntaxFixture(async (plan) => {
      const receipt = await receiptFor(plan, change);
      assert.equal(receipt.facts.predicateMatched, false);
      assert.throws(() => classifyChildReceipt(receipt, 'syntax'));
      const observed = await orchestrate(plan, receipt);
      await assertRetained(plan, observed.result);
    });
  }
  const wireChanges = [
    (message) => message.replace(/^Error\n/, ''),
    (message) => message.replace(/Public SDK[^\n]+\n/, ''),
    (message) => message.split('\n')[1],
    (message) => `Unrelated startup\n${message}`,
    (message) =>
      message.replace(
        '\nError\nAn error occurred when starting the server',
        '\nAn error occurred when starting the server'
      ),
    (message) => message.replace('\nError\nBuild failed', '\nBuild failed'),
    (message) =>
      message.replace(
        'An error occurred when starting the server',
        'Unrelated startup'
      ),
    (message) =>
      message.replace(
        'Build failed with 1 error:',
        'Build failed with 2 errors:'
      ),
  ];
  for (const change of wireChanges) {
    await syntaxFixture(async (plan) => {
      const receipt = await receiptFor(plan);
      receipt.startup.message = change(receipt.startup.message);
      assert.throws(() => classifyChildReceipt(receipt, 'syntax'));
      const observed = await orchestrate(plan, receipt);
      await assertRetained(plan, observed.result);
    });
  }
});
