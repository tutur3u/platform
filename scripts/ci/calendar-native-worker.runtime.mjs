import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  requireSourceSha,
  validateOutput,
  verify,
} from './calendar-native-artifact.mjs';
import { denyCalendarOutbound } from './calendar-native-runtime-profile.mjs';
import {
  createChildProducer,
  finalizeObservedCase,
  observeCaseReceipt,
  writeChildDiagnostics,
} from './native-wrangler-evidence.mjs';
import { spawnOwnedFixture } from './native-wrangler-observable.mjs';
import {
  prepareNativePlan,
  sealArtifact,
  startNativeWrangler,
} from './native-wrangler-runtime.mjs';

// Artifact-dependent: intentionally outside root source-only .test.* discovery.
const app = fileURLToPath(new URL('../../apps/calendar', import.meta.url));
const name = 'calendar';
const sourceSHA = process.env.NATIVE_FIXTURE_CASE
  ? undefined
  : requireSourceSha(process.argv[2]);
async function runParent() {
  const { configPath, main } = validateOutput(app, sourceSHA);
  const receipt = JSON.parse(
    readFileSync(resolve(app, 'calendar-artifact.json'), 'utf8')
  );
  verify(app, receipt, sourceSHA);
  const root = resolve(app, 'dist');
  const options = {
    profile: 'calendar',
    root,
    config: configPath,
    main,
    sourceSHA,
    canonicalHost: 'calendar-ci.invalid',
    ownerPackage: resolve(app, 'package.json'),
    seal: await sealArtifact(root),
    outbound: denyCalendarOutbound([]),
  };
  const programRoot = await realpath(
    await mkdtemp(join(tmpdir(), 'calendar-sdk-run-'))
  );
  const cwd = join(programRoot, 'case');
  const diagnosticRoot = join(programRoot, 'diagnostics');
  const tempRoot = join(cwd, 'native-sdk-temp');
  await mkdir(cwd, { mode: 0o700 });
  await mkdir(diagnosticRoot, { mode: 0o700 });
  await mkdir(tempRoot);
  const foreignPath = join(cwd, 'foreign-sentinel');
  const foreignValue = 'unrelated-calendar-fixture';
  await writeFile(foreignPath, foreignValue);
  const plan = {
    ...(await prepareNativePlan(options, tempRoot)),
    foreignPath,
    foreignValue,
    caseRoot: cwd,
    diagnosticRoot,
  };
  const planFile = join(cwd, 'parent-plan.json');
  const receiptFile = join(cwd, 'child-receipt.json');
  await writeFile(planFile, JSON.stringify({ options, plan }), {
    flag: 'wx',
    mode: 0o600,
  });
  const gates = [];
  let outcome;
  try {
    outcome = await spawnOwnedFixture({
      entry: fileURLToPath(import.meta.url),
      cwd,
      name,
      planFile,
      receiptFile,
      tempRoot,
    });
    assert.equal(outcome.error, undefined, 'Child spawn/output failed');
    assert.equal(outcome.code, 0, 'Calendar child failed');
    assert.equal(outcome.signal, null, 'Calendar child signal');
    assert.equal(outcome.closeObserved, true, 'Missing natural child close');
    assert.equal(outcome.stdioDrained, true, 'Undrained Calendar child output');
    assert.equal(outcome.intervened, false, 'Calendar child intervention');
  } catch (error) {
    gates.push(error);
  }
  const observed = await observeCaseReceipt(
    receiptFile,
    name,
    outcome,
    plan,
    gates
  );
  try {
    verify(app, receipt, sourceSHA);
  } catch (error) {
    gates.push(error);
  }
  const result = await finalizeObservedCase(plan, gates, {
    name,
    outcome,
    ...observed,
  });
  assert.deepEqual(
    result.errors,
    [],
    `Calendar evidence retained: ${programRoot}`
  );
}

async function runChild() {
  const { options, plan } = JSON.parse(
    await readFile(process.env.NATIVE_PLAN_FILE, 'utf8')
  );
  const unexpected = [];
  const producer = createChildProducer(name);
  let runtime, primary;
  before(async () => {
    try {
      await producer.observeReturnedStartup(async () => {
        runtime = await startNativeWrangler(
          { ...options, outbound: denyCalendarOutbound(unexpected) },
          plan
        );
        return runtime;
      });
    } catch (error) {
      primary = error;
      throw error;
    }
  });
  after(async () => {
    const { receipt, errors } = await producer.finish(primary);
    const diagnostics = await writeChildDiagnostics(
      receipt,
      errors,
      plan,
      process.env.NATIVE_RECEIPT_FILE
    );
    if (diagnostics.classificationError || diagnostics.diagnosticFaults.length)
      process.exitCode = 1;
  });
  function checkedTest(title, ...args) {
    const run = args.pop();
    test(title, ...args, async () => {
      try {
        await run();
      } catch (error) {
        primary = primary
          ? new AggregateError([primary, error], 'Calendar assertions failed')
          : error;
        throw error;
      }
    });
  }
  const fetchWorker = (path, headers = {}) =>
    runtime.worker.fetch(`https://calendar-ci.invalid${path}`, {
      headers,
      redirect: 'manual',
    });
  checkedTest(
    'actual native Worker renders EN/VI completion and emitted hydration assets',
    {
      timeout: 30000,
    },
    async () => {
      for (const [path, locale, headers] of [
        ['/verify-token', 'en', {}],
        ['/vi/verify-token', 'vi', {}],
        ['/verify-token', 'vi', { cookie: 'NEXT_LOCALE=vi' }],
        ['/verify-token', 'vi', { 'accept-language': 'vi,en;q=0.5' }],
      ]) {
        const response = await fetchWorker(path, headers);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') ?? '', /text\/html/);
        assert.equal(response.headers.get('x-frame-options'), 'DENY');
        const html = await response.text();
        assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
        const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(
          (m) => m[1]
        );
        const module = scripts.find(
          (src) => src.startsWith('/assets/') && /\.js(?:\?|$)/.test(src)
        );
        assert.ok(module, 'SSR hydration module missing');
        const asset = await fetchWorker(module);
        assert.equal(asset.status, 200);
        assert.match(asset.headers.get('content-type') ?? '', /javascript/);
      }
      assert.deepEqual(unexpected, []);
    }
  );
  checkedTest(
    'native exact offline URL has root worker scope and classic script bytes',
    async () => {
      const response = await fetchWorker('/serwist/sw.js');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('service-worker-allowed'), '/');
      const bytes = await response.text();
      assert.equal(
        bytes,
        readFileSync(resolve(app, 'dist/client/serwist/sw.js'), 'utf8')
      );
      assert.doesNotMatch(bytes, /<html/i);
      assert.deepEqual(unexpected, []);
    }
  );
}
if (process.env.NATIVE_FIXTURE_CASE) {
  assert.equal(process.env.NATIVE_FIXTURE_CASE, name);
  await runChild();
} else {
  test(
    'Calendar public SDK isolated emitted Worker',
    { timeout: 30000 },
    runParent
  );
}
// Signed-in RPC/navigation/refresh, provider, permissions and enabled SQL drain
// need an admitted exact-artifact fixture and remain separate cutover blockers.
