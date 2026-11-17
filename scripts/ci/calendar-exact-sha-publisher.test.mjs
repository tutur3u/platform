import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CALENDAR_LEGACY_BUILD_COMMAND,
  CALENDAR_PRODUCTION_ALIAS,
  CALENDAR_SUPABASE_HOST,
  GUARD_CODES,
  StageStop,
  assertAliasPreimage,
  assertAliasPreimageInput,
  assertAliasUnchanged,
  assertExactSha,
  assertLegacyBuildCommand,
  assertLegacyOutput,
  assertNoToken,
  assertProject,
  assertReady,
  assertSourceSeal,
  assertStageGuards,
  assertSupabaseUrl,
  formatStop,
  normalizeDeployment,
  preimageRecord,
  sealTree,
  stageCommand,
  stagedRecord,
  stopRecord,
} from './calendar-exact-sha-publisher.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const g4 = '9'.repeat(40);
const seal = 'c'.repeat(64);
const project = 'prj_calendar';

function throwsStop(fn, guardCode, message, label) {
  assert.ok(GUARD_CODES.includes(guardCode), guardCode);
  assert.throws(
    fn,
    (error) =>
      error instanceof StageStop &&
      error.guardCode === guardCode &&
      message.test(error.message),
    label ?? guardCode
  );
}

function deployment(overrides = {}) {
  return {
    id: 'dpl_staged',
    url: 'https://calendar-staged.vercel.app',
    readyState: 'READY',
    projectId: project,
    aliases: [],
    commitSha: sha,
    mainSha: sha,
    outputSeal: seal,
    ...overrides,
  };
}

function live(overrides = {}) {
  return deployment({
    id: 'dpl_g4live000',
    url: 'https://calendar-g4.vercel.app',
    aliases: [CALENDAR_PRODUCTION_ALIAS],
    commitSha: g4,
    mainSha: '',
    outputSeal: '',
    ...overrides,
  });
}

test('guard codes are fixed, unique, and formatted with the phase', () => {
  assert.equal(new Set(GUARD_CODES).size, GUARD_CODES.length);
  assert.ok(Object.isFrozen(GUARD_CODES));
  for (const code of GUARD_CODES) assert.match(code, /^[A-Z][A-Z_]+$/u);
  assert.throws(() => new StageStop('MADE_UP', 'x'), /unknown guardCode/);
  const stopped = new StageStop('ALIAS_MOVED', 'calendar alias moved', 'x');
  assert.equal(
    formatStop(stopped),
    '[ALIAS_MOVED] phase=x: calendar alias moved'
  );
  assert.deepEqual(stopRecord(stopped), [
    'terminal_state=stopped',
    'guard_code=ALIAS_MOVED',
    'phase=x',
  ]);
});

test('source and legacy recipe guards fail closed', () => {
  assert.equal(assertExactSha(sha), sha);
  throwsStop(
    () => assertExactSha(sha.slice(1)),
    'SOURCE_SHA_INVALID',
    /full lowercase main SHA/
  );
  throwsStop(
    () => assertExactSha(sha.toUpperCase()),
    'SOURCE_SHA_INVALID',
    /full lowercase/
  );
  throwsStop(
    () => assertSourceSeal({ head: other, requested: sha, onMain: true }),
    'SOURCE_HEAD_MISMATCH',
    /not the requested main SHA/
  );
  throwsStop(
    () => assertSourceSeal({ head: sha, requested: sha, onMain: false }),
    'SOURCE_NOT_ON_MAIN',
    /not on origin\/main/
  );
  const committed = JSON.parse(
    readFileSync(path.join(root, 'apps/calendar/vercel.json'), 'utf8')
  );
  assert.equal(assertLegacyBuildCommand(committed), committed);
  assert.match(
    CALENDAR_LEGACY_BUILD_COMMAND,
    /turbo:local run build --filter='@tuturuuu\/calendar\^\.\.\.' && bun run --cwd apps\/calendar build:legacy$/u
  );
  for (const buildCommand of [
    'bun run build:legacy',
    'cd ../.. && bun turbo:local run build --filter=@tuturuuu/calendar',
  ]) {
    throwsStop(
      () => assertLegacyBuildCommand({ buildCommand }),
      'BUILD_RECIPE_NOT_LEGACY',
      /not legacy/,
      buildCommand
    );
  }
  throwsStop(
    () => assertLegacyBuildCommand(null),
    'BUILD_RECIPE_NOT_LEGACY',
    /missing/
  );
});

test('output path guards refuse native, sensitive, and asset-less output', () => {
  const ok = 'static/calendar/_next/a.js';
  throwsStop(
    () => assertLegacyOutput({ config: { version: 2 }, paths: [] }),
    'OUTPUT_MISSING',
    /missing/
  );
  throwsStop(
    () =>
      assertLegacyOutput({
        config: { version: 3 },
        paths: ['static/calendar/_next/a.js', '.wrangler/deploy/config.json'],
      }),
    'OUTPUT_NATIVE_ARTIFACT',
    /vp output/
  );
  throwsStop(
    () =>
      assertLegacyOutput({
        config: { version: 3 },
        paths: [ok, 'functions/void.config.ts'],
      }),
    'OUTPUT_NATIVE_ARTIFACT',
    /vp output/
  );
  for (const [sensitive, code] of [
    ['functions/index.func/.env', 'OUTPUT_ENV_FILE'],
    ['static/.env.production.local', 'OUTPUT_ENV_FILE'],
    ['functions/x.func/.vercel/project.json', 'OUTPUT_NESTED_VERCEL'],
    ['functions/x.func/server.pem', 'OUTPUT_KEY_FILE'],
    ['static/tls.KEY', 'OUTPUT_KEY_FILE'],
  ]) {
    throwsStop(
      () =>
        assertLegacyOutput({ config: { version: 3 }, paths: [ok, sensitive] }),
      code,
      /sensitive output path refused/,
      sensitive
    );
  }
  throwsStop(
    () =>
      assertLegacyOutput({ config: { version: 3 }, paths: ['config.json'] }),
    'OUTPUT_NO_NEXT_ASSETS',
    /no Next assets/
  );
  assertLegacyOutput({
    config: { version: 3, routes: [] },
    paths: ['config.json', 'static/calendar/_next/static/chunks/app.js'],
  });
});

test('the stage command skips the domain and never carries a token', () => {
  const stage = stageCommand({ sha, seal });
  assert.deepEqual(stage, [
    'deploy',
    '--archive=tgz',
    '--prebuilt',
    '--prod',
    '--skip-domain',
    '--meta',
    `mainSha=${sha}`,
    '--meta',
    `outputSeal=${seal}`,
  ]);
  throwsStop(
    () => stageCommand({ sha, seal: 'short' }),
    'OUTPUT_SEAL_INVALID',
    /seal is missing/
  );
  assertNoToken(stage, 'secret-token');
  for (const argv of [
    ['deploy', '--token=secret-token'],
    ['deploy', 'VERCEL_TOKEN=x'],
  ]) {
    throwsStop(() => assertNoToken(argv), 'TOKEN_IN_ARGV', /token in argv/);
  }
  throwsStop(
    () => assertNoToken(['deploy', 'x'], 'x'),
    'TOKEN_IN_ARGV',
    /token in argv/
  );
});

test('staged readbacks reject the bad cases', () => {
  const staged = deployment();
  const good = {
    source: sha,
    seal,
    staged,
    supabaseUrl: `https://${CALENDAR_SUPABASE_HOST}`,
    expectedProjectId: project,
  };
  assertStageGuards(good);
  throwsStop(() => assertReady('ERROR'), 'DEPLOYMENT_NOT_READY', /not READY/);
  throwsStop(
    () => assertProject('other', project),
    'PROJECT_MISMATCH',
    /project mismatch/
  );
  throwsStop(() => assertProject('', ''), 'PROJECT_MISMATCH', /mismatch/);
  throwsStop(
    () => assertSupabaseUrl(`http://${CALENDAR_SUPABASE_HOST}`),
    'URL_NOT_HTTPS',
    /not a bare HTTPS URL/
  );
  throwsStop(
    () => assertSupabaseUrl('https://example.supabase.co'),
    'SUPABASE_HOST_REJECTED',
    /Supabase host rejected/
  );
  const bad = [
    [{ readyState: 'BUILDING' }, 'DEPLOYMENT_NOT_READY', /not READY/],
    [{ projectId: 'prj_other' }, 'PROJECT_MISMATCH', /project mismatch/],
    [{ id: '' }, 'STAGED_ID_MISSING', /id is missing/],
    [{ url: 'http://x.test' }, 'URL_NOT_HTTPS', /not a bare HTTPS URL/],
    [
      { aliases: [CALENDAR_PRODUCTION_ALIAS] },
      'STAGED_OWNS_ALIAS',
      /already owns the calendar/,
    ],
    [{ commitSha: other }, 'STAGED_COMMIT_MISMATCH', /commit does not match/],
    [{ mainSha: other }, 'STAGED_SEAL_MISMATCH', /seal does not match/],
    [{ mainSha: '' }, 'STAGED_SEAL_MISMATCH', /seal does not match/],
    [
      { outputSeal: 'd'.repeat(64) },
      'STAGED_SEAL_MISMATCH',
      /seal does not match/,
    ],
  ];
  for (const [overrides, code, message] of bad) {
    throwsStop(
      () => assertStageGuards({ ...good, staged: { ...staged, ...overrides } }),
      code,
      message,
      JSON.stringify(overrides)
    );
  }
  for (const lookalike of [
    `not${CALENDAR_PRODUCTION_ALIAS}`,
    `${CALENDAR_PRODUCTION_ALIAS}.evil.test`,
    `https://${CALENDAR_PRODUCTION_ALIAS}`,
  ]) {
    assertStageGuards({ ...good, staged: { ...staged, aliases: [lookalike] } });
  }
  const normalized = normalizeDeployment({
    uid: 'dpl_1',
    url: 'calendar-staged.vercel.app',
    readyState: 'READY',
    projectId: project,
    alias: [],
    meta: { githubCommitSha: sha, mainSha: sha, outputSeal: seal },
  });
  assert.equal(normalized.url, 'https://calendar-staged.vercel.app');
  assert.equal(normalized.mainSha, sha);
  throwsStop(
    () => normalizeDeployment(null),
    'DEPLOYMENT_INSPECT_FAILED',
    /inspect failed/
  );
  assert.equal(
    sealTree([{ path: 'config.json', sha256: seal }]),
    sealTree([{ path: 'config.json', sha256: seal }])
  );
  throwsStop(
    () => sealTree([{ path: '../config.json', sha256: seal }]),
    'OUTPUT_SEAL_INVALID',
    /seal is missing/
  );
  throwsStop(() => sealTree([]), 'OUTPUT_SEAL_INVALID', /seal is missing/);
});

test('the alias preimage is the named deployment and stays put', () => {
  assert.equal(assertAliasPreimageInput(g4), g4);
  assert.equal(assertAliasPreimageInput('dpl_g4live000'), 'dpl_g4live000');
  for (const value of [undefined, '', g4.slice(1), 'dpl_', 'main']) {
    throwsStop(
      () => assertAliasPreimageInput(value),
      'ALIAS_PREIMAGE_INPUT_INVALID',
      /alias preimage SHA or deployment id/,
      String(value)
    );
  }
  const base = { expected: g4, expectedProjectId: project };
  assert.equal(assertAliasPreimage({ ...base, live: live() }).id, live().id);
  assertAliasPreimage({ ...base, live: live({ commitSha: '', mainSha: g4 }) });
  assertAliasPreimage({
    ...base,
    expected: 'dpl_g4live000',
    live: live({ commitSha: '' }),
  });
  const rejected = [
    [{ commitSha: other }, 'ALIAS_PREIMAGE_MISMATCH', /not the expected/],
    [{ commitSha: '' }, 'ALIAS_PREIMAGE_MISMATCH', /not the expected/],
    [{ aliases: [] }, 'ALIAS_PREIMAGE_UNBOUND', /not bound to the calendar/],
    [
      { aliases: [`${CALENDAR_PRODUCTION_ALIAS}.evil.test`] },
      'ALIAS_PREIMAGE_UNBOUND',
      /not bound/,
    ],
    [{ projectId: 'prj_other' }, 'PROJECT_MISMATCH', /project mismatch/],
    [{ readyState: 'ERROR' }, 'DEPLOYMENT_NOT_READY', /not READY/],
  ];
  for (const [overrides, code, message] of rejected) {
    throwsStop(
      () => assertAliasPreimage({ ...base, live: live(overrides) }),
      code,
      message,
      JSON.stringify(overrides)
    );
  }
  throwsStop(
    () =>
      assertAliasPreimage({
        ...base,
        expected: 'dpl_otherdeploy',
        live: live(),
      }),
    'ALIAS_PREIMAGE_MISMATCH',
    /not the expected deployment/
  );
  const staged = deployment();
  assertAliasUnchanged({ before: live(), after: live(), staged });
  for (const after of [
    live({ id: 'dpl_moved0000' }),
    live({ url: 'https://calendar-moved.vercel.app' }),
    live({ aliases: [] }),
  ]) {
    throwsStop(
      () => assertAliasUnchanged({ before: live(), after, staged }),
      'ALIAS_MOVED',
      /alias moved during staging/
    );
  }
  throwsStop(
    () =>
      assertAliasUnchanged({
        before: live(),
        after: live(),
        staged: deployment({ id: live().id }),
      }),
    'STAGED_OWNS_ALIAS',
    /already owns the calendar alias/
  );
  assert.deepEqual(preimageRecord(live()), [
    `alias=${CALENDAR_PRODUCTION_ALIAS}`,
    'alias_preimage_id=dpl_g4live000',
    'alias_preimage_url=https://calendar-g4.vercel.app',
    `alias_preimage_sha=${g4}`,
  ]);
  assert.deepEqual(
    stagedRecord({
      staged,
      source: sha,
      seal,
      ref: 'refs/heads/main',
      runId: '42',
      alias: live(),
    }),
    [
      'terminal_state=staged',
      'staged_id=dpl_staged',
      'staged_url=https://calendar-staged.vercel.app',
      `main_sha=${sha}`,
      `output_seal=${seal}`,
      'source_ref=refs/heads/main',
      'run_id=42',
      'alias_readback_id=dpl_g4live000',
    ]
  );
});
