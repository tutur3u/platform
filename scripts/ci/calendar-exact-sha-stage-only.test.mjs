// Proves the Calendar exact-SHA publisher ends at `staged`: its only mode is
// `stage`, promote and alias are unreachable, and the workflow grants nothing
// beyond staging.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as publisher from './calendar-exact-sha-publisher.mjs';

const {
  CALENDAR_PRODUCTION_ALIAS,
  CALENDAR_SUPABASE_HOST,
  GUARD_CODES,
  MODES,
  PHASES,
  StageStop,
  VERCEL_SUBCOMMANDS,
  assertMode,
  assertVercelSubcommand,
  runStage,
  runVercel,
} = publisher;

const REFUSED_SUBCOMMANDS = [
  ['promote', 'https://calendar-staged.vercel.app', '--yes'],
  [
    'alias',
    'set',
    'https://calendar-staged.vercel.app',
    'calendar.tuturuuu.com',
  ],
  ['rollback', 'https://calendar-staged.vercel.app'],
  ['remove', 'dpl_staged', '--yes'],
  ['rm', 'dpl_staged', '--yes'],
];

async function rejectsStop(promise, guardCode, phase) {
  assert.ok(GUARD_CODES.includes(guardCode), guardCode);
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof StageStop, String(error));
    assert.equal(error.guardCode, guardCode);
    assert.equal(error.phase, phase);
    return true;
  });
}

function spawnSpy(result = { status: 0, stdout: '', stderr: '' }) {
  const calls = [];
  const spawn = (...args) => {
    calls.push(args);
    return result;
  };
  return { calls, spawn };
}

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const script = path.join(root, 'scripts/ci/calendar-exact-sha-publisher.mjs');
const sha = 'a'.repeat(40);
const g4 = '9'.repeat(40);
const seal = 'c'.repeat(64);
const project = 'prj_calendar';

const staged = {
  id: 'dpl_staged',
  url: 'https://calendar-staged.vercel.app',
  readyState: 'READY',
  projectId: project,
  aliases: [],
  commitSha: sha,
  mainSha: sha,
  outputSeal: seal,
};
const live = {
  id: 'dpl_g4live000',
  url: 'https://calendar-g4.vercel.app',
  readyState: 'READY',
  projectId: project,
  aliases: [CALENDAR_PRODUCTION_ALIAS],
  commitSha: g4,
  mainSha: '',
  outputSeal: '',
};

function stageDeps(calls, overrides = {}) {
  const forbidden = (name) => async () => {
    calls.push(name);
    throw new Error(`${name} must be unreachable`);
  };
  let aliasReads = 0;
  return {
    projectId: project,
    aliasPreimage: g4,
    verifySource: async () => {
      calls.push('verify-source');
      return sha;
    },
    verifyLegacyBuild: async () => calls.push('verify-legacy-build'),
    inspectAlias: async () => {
      aliasReads += 1;
      calls.push(aliasReads === 1 ? 'alias-preimage' : 'alias-readback');
      return { ...live };
    },
    recordPreimage: async () => {},
    pull: async () => calls.push('pull'),
    build: async () => calls.push('build'),
    assertSensitiveOutput: async () => calls.push('sensitive-output'),
    seal: async () => {
      calls.push('seal');
      return seal;
    },
    stage: async () => {
      calls.push('stage');
      return { ...staged };
    },
    readSupabaseUrl: async () => {
      calls.push('guard');
      return `https://${CALENDAR_SUPABASE_HOST}`;
    },
    record: async () => calls.push('record'),
    promote: forbidden('promote'),
    alias: forbidden('alias'),
    bindRollback: forbidden('bind-rollback'),
    ...overrides,
  };
}

test('stage terminates at staged and never reaches promote or alias', async () => {
  const calls = [];
  const result = await runStage(stageDeps(calls));
  assert.deepEqual(calls, PHASES);
  assert.equal(result.state, 'staged');
  assert.equal(result.staged.id, 'dpl_staged');
  assert.equal(result.alias.id, live.id);
  for (const name of ['promote', 'alias', 'bind-rollback']) {
    assert.ok(!calls.includes(name), name);
    assert.ok(!PHASES.includes(name), name);
  }
  for (const name of Object.keys(publisher)) {
    assert.doesNotMatch(name, /promote|rollback/iu, name);
  }
});

test('a wrong preimage stops before the build and records nothing', async () => {
  const calls = [];
  await rejectsStop(
    runStage(stageDeps(calls, { aliasPreimage: 'b'.repeat(40) })),
    'ALIAS_PREIMAGE_MISMATCH',
    'alias-preimage'
  );
  assert.deepEqual(calls, [
    'verify-source',
    'verify-legacy-build',
    'alias-preimage',
  ]);
});

test('a sensitive output stops before seal and stage', async () => {
  const calls = [];
  await rejectsStop(
    runStage(
      stageDeps(calls, {
        assertSensitiveOutput: async () => {
          calls.push('sensitive-output');
          throw new StageStop(
            'OUTPUT_KEY_FILE',
            'sensitive output path refused'
          );
        },
      })
    ),
    'OUTPUT_KEY_FILE',
    'sensitive-output'
  );
  assert.ok(!calls.includes('seal'));
  assert.ok(!calls.includes('stage'));
});

test('an unexpected failure still stops with a fixed code and its phase', async () => {
  const token = 'calendar-redact-me';
  await assert.rejects(
    runStage(
      stageDeps([], {
        redact: (message) => String(message).split(token).join('[redacted]'),
        build: async () => {
          throw new Error(`boom ${token}`);
        },
      })
    ),
    (error) =>
      error instanceof StageStop &&
      error.guardCode === 'UNEXPECTED_FAILURE' &&
      error.phase === 'build' &&
      error.message === 'boom [redacted]'
  );
});

test('a moved alias fails the stage and records nothing', async () => {
  const calls = [];
  let reads = 0;
  await rejectsStop(
    runStage(
      stageDeps(calls, {
        inspectAlias: async () => {
          reads += 1;
          return reads === 1 ? { ...live } : { ...live, id: 'dpl_moved0000' };
        },
      })
    ),
    'ALIAS_MOVED',
    'alias-readback'
  );
  assert.ok(!calls.includes('record'));
});

test('only the stage mode and pull/build/deploy subcommands exist', () => {
  assert.deepEqual(MODES, ['stage']);
  assert.equal(assertMode('stage'), 'stage');
  for (const mode of ['publish', 'promote', 'alias', '', undefined]) {
    assert.throws(
      () => assertMode(mode),
      (error) =>
        error.guardCode === 'USAGE_MODE' &&
        /usage: .* stage/u.test(error.message),
      String(mode)
    );
  }
  assert.deepEqual(VERCEL_SUBCOMMANDS, ['pull', 'build', 'deploy']);
  for (const args of [...REFUSED_SUBCOMMANDS, ['inspect', 'x'], []]) {
    assert.throws(
      () => assertVercelSubcommand(args),
      (error) => error.guardCode === 'VERCEL_SUBCOMMAND_REFUSED',
      args.join(' ')
    );
  }
});

test('mutation: promote, alias, rollback or remove never reach the Vercel CLI', () => {
  for (const args of REFUSED_SUBCOMMANDS) {
    const spy = spawnSpy({
      status: 0,
      stdout: 'https://x.vercel.app',
      stderr: '',
    });
    assert.throws(
      () => runVercel(args, '/tmp', spy.spawn, {}),
      (error) => error.guardCode === 'VERCEL_SUBCOMMAND_REFUSED',
      args[0]
    );
    assert.equal(spy.calls.length, 0, args[0]);
  }
  const ok = spawnSpy({
    status: 0,
    stdout: 'https://x.vercel.app\n',
    stderr: '',
  });
  assert.equal(
    runVercel(['deploy', '--prebuilt'], '/tmp', ok.spawn, {}),
    'https://x.vercel.app\n'
  );
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0][0], 'vercel');
  assert.equal(ok.calls[0][1][0], 'deploy');
  const leak = spawnSpy({ status: 0, stdout: 'tok-123', stderr: '' });
  assert.throws(
    () => runVercel(['build'], '/tmp', leak.spawn, { VERCEL_TOKEN: 'tok-123' }),
    (error) => error.guardCode === 'TOKEN_IN_OUTPUT'
  );
  const failed = spawnSpy({ status: 1, stdout: '', stderr: '' });
  assert.throws(
    () => runVercel(['pull'], '/tmp', failed.spawn, {}),
    (error) => error.guardCode === 'VERCEL_COMMAND_FAILED'
  );
});

test('mutation: a promote or alias injected into the stage path is refused', async () => {
  for (const args of REFUSED_SUBCOMMANDS) {
    for (const phase of ['build', 'stage']) {
      const calls = [];
      const spy = spawnSpy({
        status: 0,
        stdout: 'https://x.vercel.app',
        stderr: '',
      });
      const inject = async () => {
        calls.push(phase);
        runVercel(args, '/tmp', spy.spawn, {});
        return { ...staged };
      };
      await rejectsStop(
        runStage(stageDeps(calls, { [phase]: inject })),
        'VERCEL_SUBCOMMAND_REFUSED',
        phase
      );
      assert.equal(spy.calls.length, 0, `${args[0]} in ${phase}`);
      assert.ok(!calls.includes('record'), `${args[0]} in ${phase}`);
    }
  }
});

test('the CLI refuses publish and fails closed before any provider call', () => {
  const summaryDir = mkdtempSync(path.join(tmpdir(), 'calendar-stop-'));
  const summary = path.join(summaryDir, 'summary.md');
  const env = { PATH: process.env.PATH ?? '', GITHUB_STEP_SUMMARY: summary };
  const publish = spawnSync(process.execPath, [script, 'publish'], {
    encoding: 'utf8',
    env,
  });
  assert.equal(publish.status, 1);
  assert.match(
    publish.stderr,
    /^\[USAGE_MODE\] phase=inputs: usage: calendar-exact-sha-publisher\.mjs stage$/m
  );
  const stage = spawnSync(process.execPath, [script, 'stage'], {
    encoding: 'utf8',
    env,
  });
  assert.equal(stage.status, 1);
  assert.match(
    stage.stderr,
    /^\[SOURCE_SHA_INVALID\] phase=inputs: A full lowercase main SHA/m
  );
  const token = 'calendar-test-token';
  const noPreimage = spawnSync(process.execPath, [script, 'stage'], {
    encoding: 'utf8',
    env: { ...env, CALENDAR_MAIN_SHA: sha, VERCEL_TOKEN: token },
  });
  assert.equal(noPreimage.status, 1);
  assert.match(
    noPreimage.stderr,
    /^\[ALIAS_PREIMAGE_INPUT_INVALID\] phase=inputs: /m
  );
  assert.doesNotMatch(noPreimage.stdout + noPreimage.stderr, /calendar-test/);
  const noCredentials = spawnSync(process.execPath, [script, 'stage'], {
    encoding: 'utf8',
    env: { ...env, CALENDAR_MAIN_SHA: sha, CALENDAR_ALIAS_PREIMAGE: g4 },
  });
  assert.equal(noCredentials.status, 1);
  assert.match(
    noCredentials.stderr,
    /^\[CREDENTIALS_MISSING\] phase=inputs: /m
  );
  const written = readFileSync(summary, 'utf8');
  rmSync(summaryDir, { recursive: true, force: true });
  for (const code of [
    'USAGE_MODE',
    'SOURCE_SHA_INVALID',
    'ALIAS_PREIMAGE_INPUT_INVALID',
    'CREDENTIALS_MISSING',
  ]) {
    assert.match(
      written,
      new RegExp(
        `terminal_state=stopped\\nguard_code=${code}\\nphase=inputs\\n`
      )
    );
  }
  assert.doesNotMatch(written, /calendar-test/);
});

test('the workflow is a dispatch-only stage with minimal permissions', () => {
  const workflow = readFileSync(
    path.join(root, '.github/workflows/calendar-vercel-exact-sha.yaml'),
    'utf8'
  );
  const source = readFileSync(script, 'utf8');
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.match(workflow, /^ {6}main_sha:$/m);
  assert.match(workflow, /^ {6}alias_preimage:$/m);
  assert.doesNotMatch(
    workflow,
    /workflow_call:|pull_request|^\s*push:|schedule:|repository_dispatch/m
  );
  assert.match(
    workflow,
    /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/
  );
  assert.match(workflow, /^ {4}environment: vercel-stage-calendar$/m);
  assert.doesNotMatch(workflow, /environment: vercel-production/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /CALENDAR_NATIVE_CUTOVER: \$\{\{ vars\.CALENDAR_NATIVE_CUTOVER \}\}/
  );
  assert.match(workflow, /"\$CALENDAR_NATIVE_CUTOVER" = "active"/);
  assert.match(workflow, /CALENDAR_MAIN_SHA: \$\{\{ inputs\.main_sha \}\}/);
  assert.match(
    workflow,
    /CALENDAR_ALIAS_PREIMAGE: \$\{\{ inputs\.alias_preimage \}\}/
  );
  const secrets = [...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(
    (match) => match[1]
  );
  assert.deepEqual([...new Set(secrets)].sort(), [
    'VERCEL_CALENDAR_PROJECT_ID',
    'VERCEL_ORG_ID',
    'VERCEL_TOKEN',
  ]);
  const grants = [...workflow.matchAll(/^\s+(\S+): (read|write)$/gm)].map(
    (match) => `${match[1]}: ${match[2]}`
  );
  assert.deepEqual(grants.sort(), [
    'contents: read',
    'contents: read',
    'deployments: write',
  ]);
  assert.doesNotMatch(workflow, /write-all|read-all|id-token|contents: write/);
  assert.doesNotMatch(
    workflow,
    /--token|vercel (build|deploy|promote|alias|rollback)|promote/i
  );
  assert.match(
    workflow,
    /run: node scripts\/ci\/calendar-exact-sha-publisher\.mjs stage$/m
  );
  assert.doesNotMatch(
    workflow,
    /production-publication-policy|record-vercel-deployment/
  );
  assert.match(source, /'--skip-domain'/);
  assert.doesNotMatch(source, /'promote'|'alias'|'rollback'|'rm'/);
});
