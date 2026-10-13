import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startEmployeeDbStartEvidence } from './employee-schema-start-evidence.mjs';

const root = new URL('../../../', import.meta.url);
const workflow = readFileSync(
  new URL('.github/workflows/employee-schema-contract.yaml', root),
  'utf8'
);
const steps = workflow.split(/(?=^ {6}- )/mu);
const namedStep = (name) => {
  const matches = steps.filter((step) =>
    step.startsWith(`      - name: ${name}\n`)
  );
  assert.equal(matches.length, 1, `Expected exactly one ${name} step`);
  return matches[0];
};

test('trusted control checkout stays at the workspace root', () => {
  const checkouts = steps.filter((step) =>
    step.startsWith('      - uses: actions/checkout@v7\n')
  );
  assert.equal(checkouts.length, 2);
  assert.match(checkouts[0], /^ {10}ref: \$\{\{ github.sha \}\}$/mu);
  assert.doesNotMatch(checkouts[0], /^ {10}path:/mu);
  assert.match(checkouts[0], /^ {10}persist-credentials: false$/mu);
  assert.match(checkouts[1], /^ {10}ref: \$\{\{ inputs.source_sha \}\}$/mu);
  assert.match(checkouts[1], /^ {10}path: source$/mu);
  assert.match(checkouts[1], /^ {10}persist-credentials: false$/mu);
});

test('shared setup action and its backoff helper resolve from control root', () => {
  assert.match(
    workflow,
    /^ {6}- uses: \.\/\.github\/actions\/setup-bun-with-retry$/mu
  );
  assert.doesNotMatch(workflow, /(?:\.\/|\.\.\/)control\//u);
  const action = readFileSync(
    new URL('.github/actions/setup-bun-with-retry/action.yml', root),
    'utf8'
  );
  assert.match(action, /run: bash scripts\/ci\/setup-bun-with-backoff\.sh/u);
  assert.ok(
    readFileSync(new URL('scripts/ci/setup-bun-with-backoff.sh', root)).length >
      0
  );
});

test('source dependency install uses the trusted root backoff script', () => {
  const step = namedStep('Install exact source dependencies');
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /^ {8}run: bash \.\.\/scripts\/ci\/run-with-backoff\.sh bun install --frozen-lockfile$/mu
  );
});

test('strict receipt tests run from control root', () => {
  const step = namedStep('Verify strict TAP and receipt gates');
  assert.doesNotMatch(step, /working-directory:/u);
  assert.match(
    step,
    /^ {8}run: node --test apps\/database\/scripts\/programming-database-tap.test.mjs apps\/database\/scripts\/employee-schema-tap.test.mjs apps\/database\/scripts\/employee-schema-workflow.test.mjs apps\/database\/scripts\/employee-schema-typegen.test.mjs apps\/database\/scripts\/employee-schema-network.test.mjs apps\/database\/scripts\/employee-schema-start-evidence.test.mjs$/mu
  );
});

test('schema runner uses source cwd and control script', () => {
  const step = namedStep(
    'Apply full isolated schema and qualify 172 rollback assertions'
  );
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /^ {8}run: node \.\.\/apps\/database\/scripts\/verify-employee-schema-contract.mjs$/mu
  );
});

test('always cleanup uses the same source cwd and control script', () => {
  const step = namedStep('Stop only this exact owned isolated database');
  assert.match(step, /^ {8}if: always\(\)$/mu);
  assert.match(step, /^ {8}working-directory: source$/mu);
  assert.match(
    step,
    /^ {8}run: node \.\.\/apps\/database\/scripts\/verify-employee-schema-contract.mjs --cleanup$/mu
  );
});

// Type artifacts belong to the exact disposable-schema receipt, never to selected source.
test('normal qualification uploads generated schema definitions with its receipt', () => {
  assert.match(
    workflow,
    /path: \|\n {12}\$\{\{ runner.temp \}\}\/employee-schema-receipts\/qualification\.json\n {12}\$\{\{ runner.temp \}\}\/employee-schema-receipts\/generated-types\.ts/u
  );
  const controller = readFileSync(
    new URL('apps/database/scripts/verify-employee-schema-contract.mjs', root),
    'utf8'
  );
  assert.match(controller, /typegen: async \(\) =>/u);
  assert.match(controller, /generateEmployeeTypes\(/u);
  assert.match(controller, /consumerQualified: false/u);
  assert.match(
    controller,
    /process.exitCode = receipt.controllerQualified \? 0 : 1/u
  );
  assert.match(
    controller,
    /label=com.supabase.cli.project=\$\{metadata.projectId\}/u
  );
});

test('owned internal network admission precedes schema replay and always retires after database cleanup', () => {
  const create = namedStep('Create the exact owned internal database network');
  const remove = namedStep(
    'Remove only the exact owned internal network and prove drain'
  );
  assert.match(create, /employee-schema-typegen.mjs --create-network/u);
  assert.match(remove, /if: always\(\)/u);
  assert.match(remove, /employee-schema-typegen.mjs --remove-network/u);
  assert.ok(
    workflow.indexOf(create) < workflow.indexOf('Apply full isolated schema')
  );
  assert.ok(
    workflow.indexOf(remove) > workflow.indexOf('Stop only this exact owned')
  );
  assert.match(workflow, /Require network-isolated normal qualification only/u);
});

test('startup diagnostics are source-bound boolean-only evidence and cannot grant schema/types qualification', () => {
  const controller = readFileSync(
    new URL('apps/database/scripts/verify-employee-schema-contract.mjs', root),
    'utf8'
  );
  assert.ok(
    controller.indexOf('await startupObserver.ready(verifiedReadyMarker)') <
      controller.indexOf('lifecycleCode = await runIsolatedLifecycle')
  );
  assert.match(workflow, /employee-schema-receipts\/start-evidence\.json/u);
  assert.match(
    controller,
    /version: 1, sourceSha, controlSha, evidence: startupEvidence/u
  );
  assert.match(
    controller,
    /receipt.schemaQualified &&\s+receipt.typesQualified &&\s+receipt.networkQualified &&\s+receipt.startupEvidenceDrained/u
  );
  assert.doesNotMatch(
    controller,
    /schemaQualified:\s*startupEvidence|typesQualified:\s*startupEvidence/u
  );
});

test('admission diagnostic labels describe actual await boundaries without changing qualification', () => {
  const controller = readFileSync(
    new URL('apps/database/scripts/verify-employee-schema-contract.mjs', root),
    'utf8'
  );
  for (const [stage, call] of [
    ['worker-initialize', 'await startupObserver.started()'],
    ['primary-network-ready', 'await networkObserver.ready()'],
    [
      'worker-network-ready',
      'await startupObserver.ready(verifiedReadyMarker)',
    ],
    ['observer-health', 'await networkObserver.assertHealthy()'],
  ]) {
    const start = controller.indexOf(`startupAdmission = '${stage}'`);
    assert.ok(start >= 0);
    assert.ok(controller.indexOf(call, start) > start);
  }
  assert.match(
    controller,
    /failureDiagnostic\.startupAdmission =\s+startupAdmissionDiagnostic\(startupAdmission\)/u
  );
  assert.match(
    controller,
    /receipt.schemaQualified &&\s+receipt.typesQualified &&\s+receipt.networkQualified &&\s+receipt.startupEvidenceDrained/u
  );
  assert.match(
    controller,
    /process.exitCode = receipt.controllerQualified \? 0 : 1/u
  );
});

const sourceSha = 'a'.repeat(40),
  controlSha = 'b'.repeat(40);
const projectId = 'tt-source-aaaaaaaa-0123456789';
const input = {
  sourceSha,
  controlSha,
  projectId,
  dbPort: 54329,
  imageRef: 'ghcr.io/supabase/postgres:17.6.1.167',
  network: {
    id: 'c'.repeat(64),
    name: 'tt-employee-net-1-1',
    labels: {
      'ttr.employee.source': sourceSha,
      'ttr.employee.control': controlSha,
      'ttr.employee.project': projectId,
      'ttr.employee.run': '1',
      'ttr.employee.attempt': '1',
      'ttr.employee.nonce': 'd'.repeat(36),
    },
  },
};
const endId = 'f'.repeat(64);
const marker = {
  id: '1'.repeat(64),
  name: `${input.network.name}-ready-12345678`,
  labels: input.network.labels,
};
function network() {
  return {
    id: input.network.id,
    name: input.network.name,
    internal: true,
    driver: 'bridge',
    cliProject: null,
    labels: Object.fromEntries(
      Object.entries(input.network.labels).map(([key, value]) => [
        key.replace('ttr.employee.', ''),
        value,
      ])
    ),
  };
}
const markerEvent = (id, name) => ({
  Type: 'network',
  Action: 'create',
  Actor: { ID: id, Attributes: { name } },
});
// This runs the actual worker module and Linux authority/group guards. Docker is a private
// fixed-response executable fixture, not a real daemon. Non-Linux hosts must report SKIP.
for (const mode of [
  'valid',
  'malformed-network',
  'missing-network',
  'foreign-network',
  'wrong-authority',
  'wrong-group',
]) {
  test(`production worker Linux admission ${mode}`, {
    skip: process.platform !== 'linux',
    timeout: 10000,
  }, async (t) => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'employee-production-entry-test-')
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const selected = network();
    if (mode === 'foreign-network') selected.labels.project = 'foreign';
    const rows = [
      markerEvent(marker.id, marker.name),
      markerEvent(endId, 'end'),
    ];
    const script = `#!${process.execPath}
const args = process.argv.slice(2), mode = ${JSON.stringify(mode)};
if (args.includes('events')) {
  process.stdout.write(${JSON.stringify(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)});
  setInterval(() => {}, 1000);
} else if (args.includes('version')) {
  process.stdout.write(${JSON.stringify('28.0.4\n')});
} else if (args.includes('network') && args.includes('inspect')) {
  if (mode === 'missing-network') process.exit(1);
  process.stdout.write(mode === 'malformed-network' ? '{' : ${JSON.stringify(JSON.stringify(selected))});
} else process.exit(1);
`;
    writeFileSync(path.join(root, 'docker'), script, { mode: 0o700 });
    const observer = startEmployeeDbStartEvidence(input, {
      forkWorker: (file, args, options) => {
        assert.deepEqual(Object.keys(options.env).sort(), [
          'DOCKER_CONFIG',
          'GITHUB_ACTIONS',
          'GITHUB_EVENT_NAME',
          'GITHUB_REPOSITORY',
          'PATH',
        ]);
        assert.equal(options.detached, true);
        const child = fork(file, args, {
          ...options,
          env: {
            ...options.env,
            PATH: root,
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_REPOSITORY:
              mode === 'wrong-authority'
                ? 'foreign/repository'
                : 'tutur3u/platform',
          },
        });
        const send = child.send.bind(child);
        child.send = (message, callback) => {
          if (message.type === 'init') {
            assert.equal(message.value.deadlineMs, 25 * 60 * 1000);
            assert.equal(message.value.groupPid, child.pid);
          }
          return send(
            mode === 'wrong-group' && message.type === 'init'
              ? {
                  ...message,
                  value: { ...message.value, groupPid: child.pid + 1 },
                }
              : message,
            callback
          );
        };
        return child;
      },
    });
    try {
      if (mode === 'valid') {
        await observer.started();
        assert.equal((await observer.ready(marker)).observerReady, true);
      } else {
        await assert.rejects(observer.started(), /unavailable/);
        const expected = {
          'malformed-network': 'network-read-denied',
          'missing-network': 'network-read-denied',
          'foreign-network': 'network-owner-denied',
          'wrong-authority': 'authority-denied',
          'wrong-group': 'group-denied',
        };
        assert.equal(observer.initializationFailure(), expected[mode]);
      }
    } finally {
      const result = await observer.finish(endId);
      assert.equal(result.observerDrained, true);
      assert.equal(result.observerReady, mode === 'valid');
      assert.equal(result.observerEndSeen, mode === 'valid');
      assert.equal(result.observerUncertain, mode !== 'valid');
      assert.equal(result.loopbackProbeAttempted, false);
    }
  });
}
