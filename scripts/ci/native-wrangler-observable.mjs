import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';

export const syntaxPending = 'EXPECTED_SYNTAX_REJECTION_PENDING_CLOSURE';
export const syntaxClosed = 'OBSERVABLE_SYNTAX_REJECTION_WITH_CLOSED_CHILD';

// Deliberately narrow: this is the malformed-entry compiler graph, not a
// general allowance for startWorker failures or teardown errors.
export function assertIntendedSyntax(error, plan) {
  const startup = error?.cause;
  const compiler = startup?.cause;
  for (const node of [error, startup, compiler]) {
    assert.ok(node instanceof Error && node.name === 'Error');
    assert.equal(node.code, undefined);
    assert.ok(!(node instanceof AggregateError));
  }
  assert.equal(
    error.message,
    `Public SDK startup rejected; scratch retained: ${plan.scratch}`
  );
  assert.equal(error.errors, undefined);
  assert.equal(startup.errors, undefined);
  assert.match(startup.stack, /\bstartWorker\b/);
  assert.equal(compiler.cause, undefined);
  assert.match(compiler.message, /^Build failed with 1 error:/);
  assert.ok(Array.isArray(compiler.errors));
  assert.equal(compiler.errors.length, 1);
  const [diagnostic] = compiler.errors;
  assert.equal(diagnostic.cause, undefined);
  assert.equal(diagnostic.errors, undefined);
  assert.ok(
    diagnostic.detail === undefined || diagnostic.detail === null,
    'Additional supplier exception'
  );
  assert.equal(diagnostic.text, 'Unexpected "="');
  assert.equal(diagnostic.location?.line, 1);
  assert.equal(diagnostic.location?.column, 15);
  assert.equal(diagnostic.location?.lineText, 'export default = ;');
  const file = diagnostic.location?.file;
  assert.equal(typeof file, 'string');
  assert.equal(
    isAbsolute(file) ? file : resolve(dirname(plan.copyConfig), file),
    plan.copyMain,
    'Compiler diagnostic must identify the owned copied entry'
  );
  assert.ok(!diagnostic.notes?.length, 'Additional compiler diagnostic');
  assert.ok(!compiler.warnings?.length, 'Unexpected compiler warning');
}

export function requireSyntaxReceipt(receipt) {
  assert.equal(receipt.version, 2);
  assert.equal(receipt.case, 'syntax');
  assert.deepEqual(Object.keys(receipt.facts).sort(), [
    'disposeAttempted',
    'disposeSettled',
    'predicateMatched',
    'preloadRejected',
    'readyFulfilled',
    'readyRejected',
    'workerReturned',
  ]);

  assert.equal(receipt.primary, null, 'Unrelated primary failure');
  assert.equal(receipt.dispose, null, 'Unexpected public disposal');
  assert.equal(receipt.disposeIsStartup, false);
  assert.equal(receipt.startup?.name, 'Error');
  assert.equal(receipt.startup?.code, null);
  // receiptError serializes names/messages; predicateMatched proves the graph.
  assert.match(
    receipt.startup?.message,
    /^Error\nPublic SDK startup rejected; scratch retained: [^\r\n]+\nError\nAn error occurred when starting the server\nError\nBuild failed with 1 error:/
  );
  for (const [key, value] of Object.entries(receipt.facts))
    assert.equal(value, key === 'predicateMatched', key);
  return syntaxPending;
}

export function requireSyntaxClosure(exit) {
  assert.ok(exit && !exit.error, 'Child spawn/output failed');
  assert.equal(exit.code, 1, 'Intentional startup rejection must exit 1');
  assert.equal(exit.signal, null, 'Child signal');
  assert.equal(exit.closeObserved, true, 'Missing owned child close');
  assert.equal(exit.stdioDrained, true, 'Undrained child output');
  assert.equal(exit.intervened, false, 'Child intervention/watchdog');
}

// close follows exit and stdio closure. Never resolve on exit or manufacture a
// close on a timeout. A stuck child remains subject to the failing CI watchdog.
export function observeOwnedChild(child, forward = () => {}) {
  return new Promise((resolveOutcome) => {
    let error;
    const ended = new Set();
    const fault = (failure) => {
      error ??=
        failure instanceof Error
          ? failure
          : new Error('Owned child observation failed', { cause: failure });
    };
    child.on('error', fault);
    for (const [name, stream] of [
      ['stdout', child.stdout],
      ['stderr', child.stderr],
    ]) {
      if (!stream) continue;
      stream.on('error', fault);
      stream.on('data', (chunk) => {
        try {
          forward(name, chunk);
        } catch (failure) {
          fault(failure);
        }
      });
      stream.once('end', () => ended.add(name));
    }
    child.once('close', (code, signal) =>
      resolveOutcome({
        code,
        signal,
        error,
        closeObserved: true,
        stdioDrained: ended.size === 2,
        intervened: child.killed === true,
      })
    );
  });
}

export function syntaxClosureComplete(
  receipt,
  exit,
  result,
  persisted,
  status
) {
  try {
    assert.equal(status, 'ok');
    requireSyntaxReceipt(receipt);
    requireSyntaxClosure(exit);
    assert.equal(persisted, true);
    assert.equal(result.errors.length, 0);
    for (const phase of [
      'residual',
      'originalSeal',
      'copySeal',
      'foreign',
      'snapshot',
      'removal',
    ])
      assert.equal(result.phases[phase]?.ok, true, phase);
    assert.ok(result.snapshot?.path && result.snapshot.seal);
    return true;
  } catch {
    return false;
  }
}

// Keep launch policy and close observation together for the owned fixture child.
export function spawnOwnedFixture(
  { entry, cwd, name, planFile, receiptFile, tempRoot },
  forward = (stream, chunk) => process[stream].write(chunk)
) {
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: {
      ...process.env,
      NATIVE_FIXTURE_CASE: name,
      NATIVE_PLAN_FILE: planFile,
      NATIVE_RECEIPT_FILE: receiptFile,
      NATIVE_SDK_TEMP_ROOT: tempRoot,
      TMPDIR: tempRoot,
      TMP: tempRoot,
      TEMP: tempRoot,
      NODE_OPTIONS: '',
      NODE_PATH: '',
      CLOUDFLARE_ENV: '',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      WRANGLER_WRITE_LOGS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return observeOwnedChild(child, forward);
}
