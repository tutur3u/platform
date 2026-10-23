import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { readFileSnapshot, readRegularFile } from '../safe-fs.js';
import {
  causes,
  diagnosticError,
  emitChildDiagnostics,
  persistWithSummary,
  privateDiagnosticJSON,
  receiptError,
} from './native-wrangler-diagnostics.mjs';
import {
  requireSyntaxClosure,
  requireSyntaxReceipt,
} from './native-wrangler-observable.mjs';
import {
  assertChildTempIsolation,
  createNativeFinalizer,
  sealArtifact,
} from './native-wrangler-runtime.mjs';
import { casePhaseSummary } from './native-wrangler-summary.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function outside(root, path) {
  const rel = relative(root, path);
  assert.ok(
    rel && (rel.startsWith('../') || isAbsolute(rel)),
    'Diagnostic snapshot must be outside case custody'
  );
}
async function tree(root) {
  assert.equal(await realpath(root), root, 'Snapshot root must be canonical');
  const entries = [];
  async function visit(path, name) {
    const info = await lstat(path);
    const mode = info.mode & 0o7777;
    if (info.isSymbolicLink()) {
      entries.push({ name, type: 'link', mode, target: await readlink(path) });
    } else if (info.isDirectory()) {
      entries.push({ name, type: 'directory', mode });
      for (const child of (await readdir(path)).sort())
        await visit(join(path, child), name ? `${name}/${child}` : child);
    } else {
      assert.ok(info.isFile(), 'Unsupported diagnostic entry type');
      const { data: bytes, stat } = await readFileSnapshot(path);
      entries.push({
        name,
        type: 'file',
        mode: stat.mode & 0o7777,
        bytes: bytes.length,
        sha256: digest(bytes),
      });
    }
  }
  await visit(root, '');
  return entries;
}

// The caller owns both roots; no receipt or child-supplied path is accepted here.
export async function captureDiagnosticSnapshot(plan, records) {
  const { caseRoot, diagnosticRoot } = plan;
  assert.equal(await realpath(caseRoot), caseRoot);
  assert.equal(await realpath(diagnosticRoot), diagnosticRoot);
  outside(caseRoot, diagnosticRoot);
  outside(plan.scratch, diagnosticRoot);
  const source = await tree(caseRoot);
  const path = await mkdtemp(join(diagnosticRoot, 'snapshot-'));
  await chmod(path, 0o700);
  const copy = join(path, 'case');
  await mkdir(copy, { mode: 0o700 });
  for (const entry of source) {
    const target = join(copy, entry.name);
    const original = join(caseRoot, entry.name);
    if (entry.type === 'directory') {
      if (entry.name) await mkdir(target, { mode: 0o700 });
    } else if (entry.type === 'link') {
      await symlink(entry.target, target);
    } else {
      const bytes = await readRegularFile(original);
      assert.equal(
        digest(bytes),
        entry.sha256,
        'Source changed during snapshot'
      );
      await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
      await chmod(target, entry.mode);
    }
  }
  for (const entry of [...source].reverse())
    if (entry.type === 'directory')
      await chmod(join(copy, entry.name), entry.mode);
  // Independent readbacks compare content, names, types, modes and link text.
  assert.deepEqual(
    await tree(copy),
    source,
    'Snapshot byte verification failed'
  );
  assert.deepEqual(
    await tree(caseRoot),
    source,
    'Source changed before deletion'
  );
  const metadata = privateDiagnosticJSON({ version: 1, source, plan, records });
  await writeFile(join(path, 'pre-removal.json'), metadata, {
    flag: 'wx',
    mode: 0o600,
  });
  assert.equal(
    await readFile(join(path, 'pre-removal.json'), 'utf8'),
    metadata
  );
  // Retained on success and failure; the owning finite run has no snapshot sweeper.
  return { path, seal: digest(metadata), entries: source.length };
}

export {
  diagnosticError,
  receiptError,
  syntaxCauseProjection,
} from './native-wrangler-diagnostics.mjs';

export function createChildProducer(name) {
  let active, startup, dispose, completion;
  const facts = Object.fromEntries(factKeys.map((key) => [key, false]));
  const record = (primary) => ({
    receipt: {
      version: 2,
      case: name,
      primary: receiptError(primary),
      startup: receiptError(startup),
      dispose: receiptError(dispose),
      facts: { ...facts },
      disposeIsStartup: Boolean(dispose && dispose === startup),
    },
    errors: { primary, startup, dispose },
  });
  const start = async (load) => {
    active = await load();
    assert.ok(active?.worker, 'Missing returned Worker');
    facts.workerReturned = true;
    return active;
  };
  return {
    start,
    record,
    async observeReturnedStartup(load) {
      const runtime = await start(load);
      try {
        await runtime.worker.ready;
        facts.readyFulfilled = true;
      } catch (error) {
        startup = error;
        facts.readyRejected = true;
        throw error;
      }
    },
    async expectStartup(load, predicate) {
      await assert.rejects(
        async () => {
          const runtime = await start(load);
          await runtime.worker.ready;
        },
        (error) => {
          startup = error;
          facts.readyRejected = facts.workerReturned;
          predicate(error);
          facts.predicateMatched = true;
          return true;
        }
      );
    },
    async expectPreload(load) {
      await assert.rejects(
        () => start(load),
        (error) => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.equal(error.message, 'Preloaded Wrangler SDK unsupported');
          facts.preloadRejected = true;
          return true;
        }
      );
    },
    finish(primary) {
      completion ??= (async () => {
        if (
          typeof active?.worker?.dispose === 'function' &&
          typeof active.cleanup === 'function'
        ) {
          facts.disposeAttempted = true;
          try {
            await active.cleanup();
          } catch (error) {
            dispose = error;
          } finally {
            facts.disposeSettled = true;
          }
        }
        if (observedCases.has(name) && !primary)
          facts.predicateMatched = matchesObservedStartup(name, dispose);
        return record(primary);
      })();
      return completion;
    },
  };
}

export async function persistFinalization(
  plan,
  result,
  context,
  io = { writeFile, readFile }
) {
  const failures = [];
  const record = () => ({
    ...context,
    snapshot: result.snapshot ?? null,
    errors: result.errors.map(diagnosticError),
    phases: Object.fromEntries(
      Object.entries(result.phases).map(([phase, value]) => {
        const error = diagnosticError(value.error);
        return [
          phase,
          { ok: value.ok, error, residual: error?.residual ?? null },
        ];
      })
    ),
    persistenceErrors: failures.map(({ destination, error }) => ({
      destination,
      error: diagnosticError(error),
    })),
  });
  const destinations = [join(plan.caseRoot, 'parent-finalization.json')];
  if (result.snapshot)
    destinations.push(join(result.snapshot.path, 'parent-finalization.json'));
  const verified = [];
  const write = async (destination, flag) => {
    const bytes = privateDiagnosticJSON(record());
    await io.writeFile(destination, bytes, { flag, mode: 0o600 });
    assert.equal(
      await io.readFile(destination, 'utf8'),
      bytes,
      'Finalization readback mismatch'
    );
  };
  for (const destination of destinations) {
    try {
      await write(destination, 'wx');
      verified.push({ destination, observed: failures.length });
    } catch (error) {
      failures.push({ destination, error });
    }
  }
  // Update verified receipts with the other destination's failure; never retry a failed write.
  if (failures.length) {
    for (const { destination, observed } of verified) {
      if (observed === failures.length) continue;
      try {
        await write(destination, 'w');
      } catch (error) {
        failures.push({ destination, error });
      }
    }
    const error = new AggregateError(
      [...result.errors, ...failures.map(({ error }) => error)],
      'Finalization persistence failed; cleanup blocked'
    );
    error.record = record();
    throw error;
  }
  return record();
}

const observedCases = new Set([
  'wrongModule',
  'graphEscape',
  'wrongType',
  'nodeBuiltin',
]);
const observedOutcome = 'EXPECTED_USER_STARTUP_REJECTION_OBSERVED';
export function matchesObservedStartup(name, error) {
  if (
    !observedCases.has(name) ||
    error?.name !== 'MiniflareCoreError [ERR_RUNTIME_FAILURE]' ||
    error.code !== 'ERR_RUNTIME_FAILURE'
  )
    return false;
  const messages = [error.message];
  for (const line of String(error.message).split('\n')) {
    try {
      const record = JSON.parse(line);
      if (typeof record?.message === 'string') messages.push(record.message);
    } catch {
      /* Public stderr also contains non-JSON lines. */
    }
  }
  const diagnostic = {
    wrongModule: [
      'TypeError: WebAssembly.Instance(): Argument 0 must be a WebAssembly.Module',
      /(?:^|[ (])main\.mjs:2:18(?:[)\s]|$)/,
    ],
    graphEscape: [
      'TypeError: Invalid module specifier "../outside.mjs".',
      /imported from "main\.mjs"/,
    ],
    wrongType: [
      "SyntaxError: The requested module './message.txt' does not provide an export named 'absent'",
      /\/artifact\/main\.mjs:1:9(?:[)\s]|$)/,
    ],
    nodeBuiltin: [
      'Error: No such module "node:fs".',
      /imported from "main\.mjs"/,
    ],
  }[name];
  return messages.some((message) =>
    String(message)
      .split('service ')
      .some((part) => {
        const lines = part.trim().split('\n');
        return (
          lines[0] ===
            `core:user:native-portable-fixture: Uncaught ${diagnostic[0]}` &&
          diagnostic[1].test(lines.slice(1).join('\n'))
        );
      })
  );
}

const factKeys = [
  'disposeAttempted',
  'disposeSettled',
  'predicateMatched',
  'preloadRejected',
  'readyFulfilled',
  'readyRejected',
  'workerReturned',
];
const receiptKeys = [
  'case',
  'dispose',
  'disposeIsStartup',
  'facts',
  'primary',
  'startup',
  'version',
];
export function validateReceipt(value, name) {
  assert.ok(value && typeof value === 'object');
  assert.deepEqual(Object.keys(value).sort(), receiptKeys);
  assert.equal(value.version, 2);
  assert.equal(value.case, name);
  assert.equal(typeof value.disposeIsStartup, 'boolean');
  assert.deepEqual(Object.keys(value.facts).sort(), factKeys);
  for (const fact of factKeys)
    assert.equal(typeof value.facts[fact], 'boolean');
  for (const phase of [value.primary, value.dispose, value.startup]) {
    if (phase === null) continue;
    assert.deepEqual(Object.keys(phase).sort(), ['code', 'message', 'name']);
    assert.ok(
      phase.code === null ||
        (typeof phase.code === 'string' && phase.code.length <= 128)
    );
    assert.equal(typeof phase.name, 'string');
    assert.equal(typeof phase.message, 'string');
    assert.ok(phase.name.length <= 128 && phase.message.length <= 2048);
  }
  return value;
}
export function classifyChildReceipt(receipt, name) {
  validateReceipt(receipt, name);
  if (name === 'preload') {
    assert.equal(receipt.primary, null);
    assert.equal(receipt.startup, null);
    assert.equal(receipt.dispose, null);
    assert.equal(receipt.disposeIsStartup, false);
    for (const key of factKeys)
      assert.equal(receipt.facts[key], key === 'preloadRejected', key);
    return 'PROVEN_PRESTART_PRELOAD_REJECTION';
  }
  assert.equal(receipt.facts.preloadRejected, false);
  if (name === 'syntax') return requireSyntaxReceipt(receipt);
  if (observedCases.has(name)) {
    assert.equal(receipt.primary, null, 'Unrelated primary failure');
    assert.equal(receipt.startup, null, 'Unexpected start/ready rejection');
    assert.equal(receipt.disposeIsStartup, false);
    for (const key of factKeys)
      assert.equal(
        receipt.facts[key],
        !['preloadRejected', 'readyRejected'].includes(key),
        key
      );
    assert.ok(
      matchesObservedStartup(name, receipt.dispose),
      'Unmatched public startup diagnostic'
    );
    return observedOutcome;
  }
  assert.equal(receipt.primary, null, 'Primary case failed');
  assert.equal(receipt.dispose, null, 'Public disposal failed');
  assert.equal(receipt.startup, null, 'Unexpected startup rejection');
  assert.equal(receipt.facts.readyRejected, false);
  assert.equal(receipt.facts.predicateMatched, false);
  assert.equal(receipt.disposeIsStartup, false);
  assert.equal(receipt.facts.workerReturned, true);
  assert.equal(receipt.facts.disposeAttempted, true);
  assert.equal(receipt.facts.disposeSettled, true);
  return 'ORDINARY_SUCCESS';
}
export function requireChildOutcome(receipt, name, exit) {
  if (name === 'syntax') {
    requireSyntaxClosure(exit);
    return classifyChildReceipt(receipt, name);
  }
  assert.ok(exit && !exit.error, 'Child spawn failed');
  assert.equal(exit.code, 0, 'Unexpected child exit');
  assert.equal(exit.signal, null, 'Child signal');
  return classifyChildReceipt(receipt, name);
}

export { casePhaseSummary } from './native-wrangler-summary.mjs';

async function packageMetadata(entry, expectedName) {
  let directory = dirname(entry);
  while (true) {
    try {
      const metadata = JSON.parse(
        await readFile(join(directory, 'package.json'), 'utf8')
      );
      if (metadata.name === expectedName) {
        assert.ok(
          typeof metadata.version === 'string' && metadata.version.length <= 64
        );
        assert.match(
          metadata.version,
          /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
        );
        return metadata.version;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, 'Supplier package metadata not found');
    directory = parent;
  }
}
// Resolver and file reads only. The loader must use this exact cliPath.
export async function supplierReceipt(ownerPackage) {
  const owner = createRequire(ownerPackage);
  const cliPath = owner.resolve('wrangler');
  const owningWrangler = createRequire(cliPath);
  const miniflarePath = owningWrangler.resolve('miniflare');
  const wranglerBytes = await readFile(cliPath);
  const miniflareBytes = await readFile(miniflarePath);
  const summary = {
    wranglerVersion: await packageMetadata(cliPath, 'wrangler'),
    wranglerSha256: digest(wranglerBytes),
    miniflareVersion: await packageMetadata(miniflarePath, 'miniflare'),
    miniflareSha256: digest(miniflareBytes),
  };
  return { cliPath, miniflarePath, summary };
}
export function supplierSummaryLine(summary) {
  for (const key of ['wranglerSha256', 'miniflareSha256'])
    assert.match(summary[key], /^[a-f0-9]{64}$/);
  for (const key of ['wranglerVersion', 'miniflareVersion']) {
    assert.ok(typeof summary[key] === 'string' && summary[key].length <= 64);
    assert.match(summary[key], /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  }
  return `native-suppliers wrangler=${summary.wranglerVersion} sha256=${summary.wranglerSha256} miniflare=${summary.miniflareVersion} sha256=${summary.miniflareSha256}`;
}

export async function persistCaseFinalization(plan, result, context, summary) {
  return persistWithSummary(
    () => persistFinalization(plan, result, context),
    (persisted) =>
      console.log(
        casePhaseSummary(
          summary.name,
          summary.receipt,
          summary.exit,
          summary.classification,
          result,
          persisted,
          summary.receiptStatus
        )
      ),
    (bytes) =>
      writeFile(join(plan.caseRoot, 'parent-diagnostic-faults.json'), bytes, {
        flag: 'wx',
        mode: 0o600,
      })
  );
}

export async function readReceipt(path, name) {
  const bytes = await readRegularFile(path, { maxBytes: 8192 });
  return validateReceipt(JSON.parse(bytes), name);
}

export async function observeCaseReceipt(
  receiptFile,
  name,
  outcome,
  plan,
  gates
) {
  let classification, receipt;
  let receiptStatus = 'notrun';
  try {
    try {
      receipt = await readReceipt(receiptFile, name);
      receiptStatus = 'ok';
    } catch (error) {
      receiptStatus = 'fail';
      throw error;
    }
    classification = requireChildOutcome(receipt, name, outcome);
    if (classification === 'PROVEN_PRESTART_PRELOAD_REJECTION') {
      await realpath(plan.scratch);
      assert.deepEqual(await sealArtifact(plan.copyRoot), plan.seal);
      await assert.rejects(stat(plan.sdkWorkingDir), { code: 'ENOENT' });
      assert.equal(await readFile(plan.envFile, 'utf8'), '');
    }
  } catch (error) {
    gates.push(error);
  }
  return { classification, receipt, receiptStatus };
}

export async function writeChildDiagnostics(
  receipt,
  errors,
  plan,
  receiptFile
) {
  return emitChildDiagnostics(
    { receipt, errors, plan },
    {
      writePrivate: (name, bytes) =>
        writeFile(join(process.cwd(), name), bytes, {
          flag: 'wx',
          mode: 0o600,
        }),
      writeReceipt: (bytes) =>
        writeFile(receiptFile, bytes, { flag: 'wx', mode: 0o600 }),
      classify: classifyChildReceipt,
    }
  );
}

export { causes } from './native-wrangler-diagnostics.mjs';

export async function runChildFixture({
  name,
  cases,
  producer,
  plan,
  receiptFile,
}) {
  let primary;
  try {
    await assertChildTempIsolation();
    assert.ok(Object.hasOwn(cases, name));
    await cases[name]();
  } catch (error) {
    primary = error;
  }
  const { receipt, errors } = await producer.finish(primary);
  let diagnostics;
  try {
    diagnostics = await writeChildDiagnostics(
      receipt,
      errors,
      plan(),
      receiptFile
    );
  } catch (error) {
    if (name !== 'syntax') throw error;
    // Code 1 is reserved for the fully persisted intentional syntax rejection.
    // A diagnostic failure must remain distinguishable even after receipt write.
    process.exitCode = 2;
    try {
      await writeFile(
        join(process.cwd(), 'child-finalization-fault.json'),
        privateDiagnosticJSON({ error: diagnosticError(error) }),
        { flag: 'wx', mode: 0o600 }
      );
    } catch {
      /* Failed persistence remains NOTPASS; retain the source tree. */
    }
    try {
      console.error('native-child diagnostics=fail classification=NOTPASS');
    } catch {
      /* Parent still observes exit 2. */
    }
    return;
  }
  const failed =
    diagnostics.classificationError || diagnostics.diagnosticFaults.length;
  if (name === 'syntax') process.exitCode = failed ? 2 : 1;
  else if (failed) process.exitCode = 1;
}

export async function finalizeObservedCase(
  plan,
  gates,
  { name, receipt, outcome, classification, receiptStatus },
  remove
) {
  const result = await createNativeFinalizer(plan, remove, {
    classification,
    exit: outcome,
  })(gates);
  await persistCaseFinalization(
    plan,
    result,
    {
      exit: outcome
        ? {
            code: outcome.code ?? null,
            signal: outcome.signal ?? null,
            spawnError: diagnosticError(outcome.error),
          }
        : null,
      classification,
      gates: gates.map(diagnosticError),
    },
    { name, receipt, exit: outcome, classification, receiptStatus }
  );
  return result;
}

export async function observeStartupFailure(producer, load, name, expected) {
  if (name !== 'syntax') {
    await producer.observeReturnedStartup(load);
    return;
  }
  await producer.expectStartup(load, (error) => {
    if (typeof expected === 'function') expected(error);
    else assert.match(causes(error), expected);
  });
}
