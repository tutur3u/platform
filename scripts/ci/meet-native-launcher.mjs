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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMeetFinalizer,
  prepareMeetGraph,
} from './meet-native-graph-files.mjs';
import { inspectMeetGraph, PROFILE } from './meet-native-profile.mjs';
import {
  readMeetFixtureReceipt,
  readMeetProductionReceipt,
} from './meet-native-fixture-supplier.mjs';
import { PRODUCTION_PROFILE } from './meet-native-inventory.mjs';
import { createMeetSsrCollector } from './meet-ssr-capture.mjs';
import { observeOwnedChild } from './native-wrangler-observable.mjs';

export function meetChildEnvironment(
  env,
  { caseRoot, tempRoot, planFile, receiptFile, sourceSHA, profile }
) {
  if (profile !== undefined)
    assert.ok(
      [PROFILE, PRODUCTION_PROFILE].includes(profile),
      'Unknown child graph profile'
    );
  const result = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR'])
    if (env[name]) result[name] = env[name];
  return {
    ...result,
    HOME: join(caseRoot, 'home'),
    XDG_CONFIG_HOME: join(caseRoot, 'home'),
    XDG_CACHE_HOME: join(caseRoot, 'home'),
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    NATIVE_SDK_TEMP_ROOT: tempRoot,
    NATIVE_PLAN_FILE: planFile,
    NATIVE_RECEIPT_FILE: receiptFile,
    NATIVE_FIXTURE_CASE: 'meet-emitted-v1',
    NODE_OPTIONS: '',
    NODE_PATH: '',
    CLOUDFLARE_ENV: '',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_SEND_METRICS: 'false',
    CI: 'true',
    GITHUB_SHA: sourceSHA,
    GITHUB_REF:
      profile === PRODUCTION_PROFILE ||
      (profile === undefined && env.GITHUB_REF === 'refs/heads/production')
        ? 'refs/heads/production'
        : 'refs/heads/ci-fixture',
  };
}

export async function launchMeet(sourceSHA, fixture) {
  assert.match(sourceSHA ?? '', /^[a-f0-9]{40}$/);
  const app =
    fixture?.appDirectory ??
    (await realpath(
      fileURLToPath(new URL('../../apps/meet', import.meta.url))
    ));
  const ownerPackage = fixture?.ownerPackage ?? join(app, 'package.json');
  const plan = await inspectMeetGraph({
    appDirectory: app,
    sourceSHA,
    ownerPackage,
    ...(fixture?.profile === PRODUCTION_PROFILE
      ? { admission: fixture.admission }
      : {}),
  });
  if (fixture) {
    const production = fixture.profile === PRODUCTION_PROFILE;
    assert.deepEqual(
      Object.keys(fixture).sort(),
      [
        'appDirectory',
        'ownerPackage',
        'receiptPath',
        ...(production ? ['admission', 'profile'] : []),
      ].sort()
    );
    assert.deepEqual(
      plan,
      await (production ? readMeetProductionReceipt : readMeetFixtureReceipt)(
        sourceSHA,
        fixture.receiptPath
      )
    );
  }
  const programRoot = await realpath(
    await mkdtemp(join(tmpdir(), 'meet-native-run-'))
  );
  await chmod(programRoot, 0o700);
  const diagnosticRoot = join(programRoot, 'diagnostics');
  await mkdir(diagnosticRoot, { mode: 0o700 });
  // Both repetitions use new registry/home/temp/SQLite custody, and all ten cases.
  const instances = new Set();
  for (const round of [1, 2]) {
    const caseRoot = await realpath(await mkdtemp(join(programRoot, 'case-')));
    const tempRoot = join(caseRoot, 'native-sdk-temp');
    await mkdir(tempRoot, { mode: 0o700 });
    await mkdir(join(caseRoot, 'home'), { mode: 0o700 });
    const foreignPath = join(caseRoot, 'foreign-sentinel');
    const foreignValue = randomUUID();
    await writeFile(foreignPath, foreignValue, { flag: 'wx', mode: 0o600 });
    const context = {
      caseRoot,
      diagnosticRoot,
      tempRoot,
      foreignPath,
      foreignValue,
    };
    let prepared;
    try {
      prepared = await prepareMeetGraph(plan, context);
    } catch (error) {
      throw new Error(
        `Meet preparation failed; evidence retained: ${caseRoot}`,
        { cause: error }
      );
    }
    const planFile = join(caseRoot, 'parent-plan.json'),
      receiptFile = join(caseRoot, 'child-receipt.json');
    await writeFile(planFile, JSON.stringify({ plan, prepared }), {
      flag: 'wx',
      mode: 0o600,
    });
    const gates = [];
    const collector = createMeetSsrCollector();
    const outcome = await observeOwnedChild(
      spawn(
        process.execPath,
        [
          '--test',
          '--test-concurrency=1',
          fileURLToPath(
            new URL('./meet-cloudflare-render.runtime.mjs', import.meta.url)
          ),
        ],
        {
          cwd: caseRoot,
          env: meetChildEnvironment(process.env, {
            ...context,
            planFile,
            receiptFile,
            sourceSHA,
            profile: plan.profile,
          }),
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      ),
      collector.forward
    );
    let ssr;
    try {
      ssr = collector.finish(outcome, sourceSHA);
    } catch (error) {
      gates.push(error);
      ssr = { availability: 'UNKNOWN', closure: 'UNKNOWN' };
    }
    let receipt;
    // Receipt acquisition and child outcome are independent failure channels.
    try {
      receipt = JSON.parse(await readFile(receiptFile));
    } catch (error) {
      gates.push(error);
    }
    try {
      if (outcome.error) throw outcome.error;
      assert.equal(outcome.code, 0, 'Meet child failed');
      assert.equal(outcome.signal, null);
      assert.equal(outcome.closeObserved, true);
      assert.equal(outcome.stdioDrained, true);
      assert.equal(outcome.intervened, false);
      assert.ok(receipt, 'Missing graph lifecycle receipt');
      assert.equal(receipt.schema, 1);
      assert.equal(
        receipt.completed,
        13,
        'All ten original cases and three hook controls required'
      );
      assert.deepEqual(receipt.lifecycle.errors, []);
      assert.deepEqual(receipt.lifecycle.roles, ['app', 'probe']);
      for (const role of ['probe', 'app'])
        assert.equal(
          receipt.lifecycle.phases.filter(
            (p) => p.role === role && p.phase === 'dispose' && p.ok
          ).length,
          1
        );
      assert.equal(receipt.internalCleanup, 'UNKNOWN');
      assert.equal(receipt.descendantClosure, 'UNKNOWN');
      assert.equal(receipt.sourceSHA, sourceSHA);
      assert.deepEqual(receipt.supplier.summary, plan.supplier);
      assert.equal(receipt.policies.appControls, 2);
      assert.equal(receipt.policies.probeControls, 9);
      assert.equal(receipt.policies.forwarded, 1);
      assert.deepEqual(receipt.policies.unexpected, []);
      for (const value of Object.values(receipt.registry)) {
        assert.ok(
          !instances.has(value.value.instanceId),
          'Registry instance reused across fresh graphs'
        );
        instances.add(value.value.instanceId);
      }
    } catch (error) {
      gates.push(error);
    }
    const result = await createMeetFinalizer(plan, prepared)(gates, {
      round,
      outcome,
      receipt,
      ssr,
    });
    console.log(
      `Meet graph ${round}: childClose=${outcome.closeObserved}; stdioDrained=${outcome.stdioDrained}; internalCleanup=UNKNOWN; descendantClosure=UNKNOWN`
    );
    if (result.errors.length)
      throw new AggregateError(
        result.errors,
        `Meet graph NOTPASS; evidence retained: ${caseRoot}`
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 3) await launchMeet(process.argv[2]);
  else {
    assert.equal(process.argv.length, 5);
    const production = process.argv[3] === '--production-receipt';
    assert.ok(
      production || process.argv[3] === '--fixture-receipt',
      'Unknown Meet profile selector'
    );
    const plan = await (
      production ? readMeetProductionReceipt : readMeetFixtureReceipt
    )(process.argv[2], process.argv[4]);
    await launchMeet(process.argv[2], {
      appDirectory: plan.app,
      ownerPackage: plan.ownerPackage,
      receiptPath: process.argv[4],
      ...(production
        ? { profile: PRODUCTION_PROFILE, admission: plan.admission }
        : {}),
    });
  }
}
