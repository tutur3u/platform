import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  appendFile,
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
import { createCalendar500Diagnostics } from './calendar-response-diagnostics.mjs';
import {
  createCalendarSsrCollector,
  writeCalendarSsrPacket,
} from './calendar-ssr-capture.mjs';
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
    fixtureVars: { CALENDAR_SSR_DIAGNOSTICS: 'fixture-v1' },
    root,
    config: configPath,
    main,
    sourceSHA,
    canonicalHost: 'calendar.tuturuuu.com',
    ownerPackage: resolve(app, 'package.json'),
    seal: await sealArtifact(root, 'calendar'),
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
  const collector = createCalendarSsrCollector();
  try {
    outcome = await spawnOwnedFixture(
      {
        entry: fileURLToPath(import.meta.url),
        cwd,
        name,
        planFile,
        receiptFile,
        tempRoot,
      },
      collector.forward
    );
    assert.equal(outcome.error, undefined, 'Child spawn/output failed');
    assert.equal(outcome.code, 0, 'Calendar child failed');
    assert.equal(outcome.signal, null, 'Calendar child signal');
    assert.equal(outcome.closeObserved, true, 'Missing natural child close');
    assert.equal(outcome.stdioDrained, true, 'Undrained Calendar child output');
    assert.equal(outcome.intervened, false, 'Calendar child intervention');
  } catch (error) {
    gates.push(error);
  }
  try {
    const packet = collector.finish(outcome, {
      sourceSHA,
      runId: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: This direct Node CI fixture does not run through Turbo.
      job: process.env.GITHUB_JOB,
    });
    const packetFile = join(
      process.env.RUNNER_TEMP ?? diagnosticRoot,
      `calendar-ssr-${packet.sourceSHA}-${packet.runId}-${packet.attempt}-${packet.job}.json`
    );
    await writeCalendarSsrPacket(packetFile, packet);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `ssr_diagnostic=${packetFile}\n`
      );
  } catch {
    gates.push(new Error('Sanitized Calendar SSR diagnostics unavailable'));
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
  const responseDiagnostics = createCalendar500Diagnostics();
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
    responseDiagnostics.afterDispose();
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
    test(title, ...args, async (context) => {
      try {
        await run(context);
      } catch (error) {
        primary =
          primary && primary !== error
            ? new AggregateError([primary, error], 'Calendar assertions failed')
            : error;
        throw error;
      }
    });
  }
  const fetchWorker = (path, headers = {}) =>
    runtime.worker.fetch(`https://calendar.tuturuuu.com${path}`, {
      headers,
      redirect: 'manual',
    });
  checkedTest(
    'actual native Worker renders EN/VI completion and emitted hydration assets',
    {
      timeout: 30000,
    },
    async (context) => {
      for (const [path, locale, headers] of [
        ['/verify-token', 'en', {}],
        ['/vi/verify-token', 'vi', {}],
        ['/verify-token', 'vi', { cookie: 'NEXT_LOCALE=vi' }],
        ['/verify-token', 'vi', { 'accept-language': 'vi,en;q=0.5' }],
      ]) {
        const response = await fetchWorker(path, headers);
        try {
          assert.equal(
            response.status,
            200,
            `Calendar request=https://calendar.tuturuuu.com${path.slice(0, 160)} location=${(response.headers.get('location') ?? '<absent>').split(/[?#]/, 1)[0].slice(0, 240)}`
          );
        } catch (error) {
          primary = error;
          responseDiagnostics.fail(error, response, context.signal);
        }
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
