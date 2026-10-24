import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegularFile } from '../safe-fs.js';
import {
  APPS_ASSERTION_GROUPS,
  admitAppsSupplier,
} from './apps-native-runtime.mjs';
import {
  appsRoles,
  createAppsFinalizer,
  inspectAppsPlan,
  prepareAppsSessions,
} from './apps-native-runtime-plan.mjs';
import { supplierReceipt } from './native-wrangler-evidence.mjs';
import { observeOwnedChild } from './native-wrangler-observable.mjs';

export function appsChildEnvironment(
  env,
  {
    caseRoot,
    tempRoot,
    planFile,
    receiptFile,
    sourceSHA,
    artifactReceipt,
    mode,
  }
) {
  appsRoles(mode);
  const inherited = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR'])
    if (env[key]) inherited[key] = env[key];
  if (mode === 'browser')
    inherited.PLAYWRIGHT_BROWSERS_PATH =
      env.PLAYWRIGHT_BROWSERS_PATH ??
      join(
        platform() === 'darwin'
          ? join(homedir(), 'Library', 'Caches')
          : (env.XDG_CACHE_HOME ?? join(homedir(), '.cache')),
        'ms-playwright'
      );
  return {
    ...inherited,
    HOME: join(caseRoot, 'home'),
    XDG_CONFIG_HOME: join(caseRoot, 'home'),
    XDG_CACHE_HOME: join(caseRoot, 'home'),
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    NATIVE_SDK_TEMP_ROOT: tempRoot,
    NATIVE_FIXTURE_CASE: `apps-${mode}-v1`,
    NATIVE_PLAN_FILE: planFile,
    NATIVE_RECEIPT_FILE: receiptFile,
    APPS_SOURCE_SHA: sourceSHA,
    CI_SOURCE_SHA: sourceSHA,
    APPS_ARTIFACT_RECEIPT: artifactReceipt,
    NODE_OPTIONS: '',
    NODE_PATH: '',
    CLOUDFLARE_ENV: '',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_SEND_METRICS: 'false',
    CI: 'true',
  };
}

export function requireAppsChildOutcome(outcome) {
  assert.ok(outcome && !outcome.error, 'Owned Apps child spawn/output failed');
  assert.equal(outcome.code, 0, 'Apps child failed');
  assert.equal(outcome.signal, null, 'Apps child signalled');
  assert.equal(outcome.closeObserved, true, 'Missing natural child close');
  assert.equal(outcome.stdioDrained, true, 'Undrained Apps child pipes');
  assert.equal(outcome.intervened, false, 'Apps child intervention');
}
export function requireAppsReceipt(receipt, plan, mode) {
  assert.deepEqual(Object.keys(receipt).sort(), [
    'completed',
    'descendantClosure',
    'errors',
    'internalCleanup',
    'lifecycle',
    'mode',
    'policies',
    'schema',
    'sourceSHA',
    'supplier',
  ]);
  assert.equal(receipt.schema, 1);
  assert.equal(receipt.mode, mode);
  assert.equal(receipt.sourceSHA, plan.sourceSHA);
  assert.deepEqual(receipt.completed, APPS_ASSERTION_GROUPS[mode]);
  assert.deepEqual(receipt.errors, []);
  assert.equal(receipt.internalCleanup, 'UNKNOWN');
  assert.equal(receipt.descendantClosure, 'UNKNOWN');
  admitAppsSupplier(receipt.supplier.summary);
  const roles = appsRoles(mode);
  const lifecycle = receipt.lifecycle;
  assert.deepEqual(lifecycle.roles, roles);
  assert.deepEqual(lifecycle.errors, []);
  assert.equal(lifecycle.primaryIdentity, null);
  assert.equal(lifecycle.internalCleanup, 'UNKNOWN');
  assert.equal(lifecycle.descendantClosure, 'UNKNOWN');
  assert.deepEqual(lifecycle.phases, [
    ...roles.flatMap((role) =>
      ['acquired', 'ready'].map((phase) => ({
        role,
        phase,
        ok: true,
        error: null,
        errorIdentity: null,
      }))
    ),
    ...roles
      .slice()
      .reverse()
      .map((role) => ({
        role,
        phase: 'dispose',
        ok: true,
        error: null,
        errorIdentity: null,
      })),
  ]);
  assert.deepEqual(Object.keys(receipt.policies).sort(), roles.slice().sort());
  for (const role of roles) {
    const policy = receipt.policies[role];
    assert.deepEqual(Object.keys(policy).sort(), [
      'assurance',
      'controls',
      'permitted',
      'unexpected',
    ]);
    assert.equal(policy.controls, 2);
    assert.equal(
      policy.assurance,
      mode === 'browser' ? 0 : role === 'app' ? 4 : 1
    );
    assert.ok(Number.isInteger(policy.permitted));
    if (mode === 'http' && role === 'app')
      assert.ok(policy.permitted > 0 && policy.permitted <= 30);
    else assert.equal(policy.permitted, 0);
    assert.deepEqual(
      policy.unexpected,
      role === 'negative'
        ? [
            {
              method: 'GET',
              url: 'https://apps-unadmitted.invalid/api/v1/users/me/profile',
            },
          ]
        : []
    );
  }
}
export async function readAppsChildPlan(mode) {
  assert.equal(process.env.NATIVE_FIXTURE_CASE, `apps-${mode}-v1`);
  const { plan, prepared } = JSON.parse(
    await readFile(process.env.NATIVE_PLAN_FILE)
  );
  assert.equal(plan.sourceSHA, process.env.APPS_SOURCE_SHA);
  assert.equal(plan.artifactReceipt, process.env.APPS_ARTIFACT_RECEIPT);
  assert.equal(prepared.mode, mode);
  assert.equal(prepared.caseRoot, process.cwd());
  assert.equal(prepared.tempRoot, process.env.NATIVE_SDK_TEMP_ROOT);
  assert.equal(
    process.env.NATIVE_RECEIPT_FILE,
    join(prepared.caseRoot, 'child-receipt.json')
  );
  return { plan, prepared, receiptFile: process.env.NATIVE_RECEIPT_FILE };
}

// Finite launch, not a watchdog: only natural subprocess close can qualify it.
export async function launchAppsAcceptance(
  entry,
  mode,
  sourceSHA,
  artifactReceipt
) {
  assert.equal(process.env.CI, 'true');
  assert.equal(
    process.env.NATIVE_FIXTURE_CASE,
    undefined,
    'Recursive Apps launch'
  );
  const appDirectory = await realpath(
    fileURLToPath(new URL('../../apps/apps/', import.meta.url))
  );
  const plan = await inspectAppsPlan({
    appDirectory,
    ownerPackage: join(appDirectory, 'package.json'),
    sourceSHA,
    artifactReceipt,
  });
  const root = join(dirname(plan.artifactReceipt), 'apps-native-evidence');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const programRoot = await realpath(
    await mkdtemp(join(await realpath(root), 'run-'))
  );
  await chmod(programRoot, 0o700);
  const caseRoot = join(programRoot, 'case'),
    diagnosticRoot = join(programRoot, 'diagnostics');
  const tempRoot = join(caseRoot, 'native-sdk-temp');
  for (const path of [
    caseRoot,
    diagnosticRoot,
    tempRoot,
    join(caseRoot, 'home'),
  ])
    await mkdir(path, { mode: 0o700 });
  const foreignPath = join(caseRoot, 'foreign-sentinel'),
    foreignValue = randomUUID();
  await writeFile(foreignPath, foreignValue, { flag: 'wx', mode: 0o600 });
  const context = {
    caseRoot,
    diagnosticRoot,
    tempRoot,
    foreignPath,
    foreignValue,
  };
  const prepared = await prepareAppsSessions(plan, context, mode);
  const planFile = join(caseRoot, 'parent-plan.json'),
    receiptFile = join(caseRoot, 'child-receipt.json');
  await writeFile(planFile, JSON.stringify({ plan, prepared }), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(`Apps ${mode} private evidence: ${programRoot}`);
  const outcome = await observeOwnedChild(
    spawn(
      process.execPath,
      ['--test', '--test-concurrency=1', resolve(entry)],
      {
        cwd: caseRoot,
        env: appsChildEnvironment(process.env, {
          ...context,
          planFile,
          receiptFile,
          sourceSHA,
          artifactReceipt: plan.artifactReceipt,
          mode,
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    ),
    (stream, bytes) => process[stream].write(bytes)
  );
  const gates = [];
  let receipt;
  try {
    requireAppsChildOutcome(outcome);
  } catch (error) {
    gates.push(error);
  }
  try {
    receipt = JSON.parse(
      await readRegularFile(receiptFile, { maxBytes: 65536 })
    );
    requireAppsReceipt(receipt, plan, mode);
    assert.deepEqual(
      await supplierReceipt(plan.ownerPackage),
      receipt.supplier,
      'Parent supplier ancestry/readback mismatch'
    );
  } catch (error) {
    gates.push(error);
  }
  const result = await createAppsFinalizer(plan, prepared)(gates, {
    outcome,
    receipt,
  });
  if (result.errors.length)
    throw new AggregateError(
      result.errors,
      `Apps ${mode} NOTPASS; evidence retained: ${programRoot}`
    );
}
