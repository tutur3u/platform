import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_BUILD_COMMAND,
  MAIL_PRODUCTION_ALIAS,
  MAIL_SUPABASE_HOST,
  PHASES,
  assertAliasBeforePromote,
  assertExactSha,
  assertLegacyOutput,
  assertNoToken,
  assertPreboundRollback,
  assertProject,
  assertPublicationGuards,
  assertReady,
  assertSourceSeal,
  assertSupabaseUrl,
  legacyVercelJson,
  listOutput,
  normalizeDeployment,
  runPublish,
  promoteCommand,
  sealTree,
  stageCommand,
} from './mail-exact-sha-publisher.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const seal = 'c'.repeat(64);
const project = 'prj_mail';

function deployment(overrides = {}) {
  return {
    id: 'dpl_staged',
    url: 'https://mail-staged.vercel.app',
    readyState: 'READY',
    projectId: project,
    aliases: [],
    commitSha: sha,
    mainSha: sha,
    outputSeal: seal,
    ...overrides,
  };
}

test('the publish order binds rollback before one promote', async () => {
  const calls = [];
  const result = await runPublish({
    projectId: project,
    verifySource: async () => {
      calls.push('verify-source');
      return sha;
    },
    prepareLegacyBuild: async () => calls.push('prepare-legacy-build'),
    pull: async () => calls.push('pull'),
    build: async () => calls.push('build'),
    seal: async () => {
      calls.push('seal');
      return seal;
    },
    stage: async () => {
      calls.push('stage');
      return deployment();
    },
    inspectAlias: async () => {
      calls.push('guard');
      return deployment({
        id: 'dpl_rollback',
        url: 'https://mail.tuturuuu.com',
        aliases: [MAIL_PRODUCTION_ALIAS],
      });
    },
    readSupabaseUrl: async () => `https://${MAIL_SUPABASE_HOST}`,
    bindRollback: async () => calls.push('bind-rollback'),
    promote: async () => calls.push('promote'),
  });
  assert.deepEqual(calls, PHASES);
  assert.equal(result.staged.id, 'dpl_staged');
  assert.equal(calls.filter((call) => call === 'promote').length, 1);
});

test('source, legacy output, and command guards fail closed', () => {
  assert.equal(assertExactSha(sha), sha);
  assert.throws(() => assertExactSha(sha.slice(1)), /full lowercase main SHA/);
  assert.throws(
    () => assertSourceSeal({ head: other, requested: sha, onMain: true }),
    /not the requested main SHA/
  );
  assert.throws(
    () => assertSourceSeal({ head: sha, requested: sha, onMain: false }),
    /not on origin\/main/
  );
  const rewritten = legacyVercelJson({
    buildCommand:
      'cd ../.. && bun turbo:local run build --filter=@tuturuuu/mail',
    installCommand: 'bun install --frozen-lockfile',
  });
  assert.equal(rewritten.buildCommand, LEGACY_BUILD_COMMAND);
  assert.equal(rewritten.installCommand, 'bun install --frozen-lockfile');
  assert.throws(
    () => assertLegacyOutput({ config: { version: 2 }, paths: [] }),
    /missing/
  );
  assert.throws(
    () =>
      assertLegacyOutput({
        config: { version: 3 },
        paths: ['static/_next/a.js', '.wrangler/deploy/config.json'],
      }),
    /vp output/
  );
  assertLegacyOutput({
    config: { version: 3, routes: [] },
    paths: ['config.json', 'static/_next/static/chunks/app.js'],
  });
  const stage = stageCommand({ sha, seal });
  const promote = promoteCommand('https://mail-staged.vercel.app');
  assert.deepEqual(stage.slice(0, 5), [
    'deploy',
    '--archive=tgz',
    '--prebuilt',
    '--prod',
    '--skip-domain',
  ]);
  assert.deepEqual(promote, [
    'promote',
    'https://mail-staged.vercel.app',
    '--yes',
  ]);
  assertNoToken(stage.concat(promote), 'secret-token');
  assert.throws(
    () => assertNoToken(['deploy', '--token=secret-token']),
    /token in argv/
  );
});

test('READY, project, Supabase, HTTPS, and alias guards reject the bad cases', () => {
  const staged = deployment();
  const rollback = deployment({
    id: 'dpl_rollback',
    url: 'https://mail.tuturuuu.com',
    aliases: [MAIL_PRODUCTION_ALIAS],
  });
  const good = {
    source: sha,
    seal,
    staged,
    rollback,
    supabaseUrl: `https://${MAIL_SUPABASE_HOST}`,
    expectedProjectId: project,
  };
  assertPublicationGuards(good);
  assert.throws(() => assertReady('ERROR'), /not READY/);
  assert.throws(() => assertProject('other', project), /project mismatch/);
  assert.throws(
    () => assertSupabaseUrl('http://nzamlzqfdwaaxdefwraj.supabase.co'),
    /not a bare HTTPS URL/
  );
  assert.throws(
    () => assertSupabaseUrl('https://example.supabase.co'),
    /Supabase host rejected/
  );
  assert.throws(
    () =>
      assertAliasBeforePromote({
        stagedAliases: [MAIL_PRODUCTION_ALIAS],
        rollbackAliases: [MAIL_PRODUCTION_ALIAS],
      }),
    /already owns the mail alias/
  );
  for (const lookalike of [
    `not${MAIL_PRODUCTION_ALIAS}`,
    `${MAIL_PRODUCTION_ALIAS}.evil.test`,
    `https://${MAIL_PRODUCTION_ALIAS}`,
    `prefix ${MAIL_PRODUCTION_ALIAS}`,
  ]) {
    assert.throws(
      () =>
        assertAliasBeforePromote({
          stagedAliases: [],
          rollbackAliases: [lookalike],
        }),
      /not bound to the mail alias/,
      lookalike
    );
  }
  assert.throws(
    () =>
      assertPreboundRollback({
        rollbackId: 'same',
        stagedId: 'same',
        rollbackUrl: 'https://mail.tuturuuu.com',
        stagedUrl: 'https://mail-staged.vercel.app',
      }),
    /not prebound/
  );
  assert.throws(
    () =>
      assertPublicationGuards({
        ...good,
        staged: { ...staged, mainSha: other },
      }),
    /seal does not match/
  );
  const normalized = normalizeDeployment({
    uid: 'dpl_1',
    url: 'mail-staged.vercel.app',
    readyState: 'READY',
    projectId: project,
    alias: [],
    meta: { githubCommitSha: sha, mainSha: sha, outputSeal: seal },
  });
  assert.equal(normalized.url, 'https://mail-staged.vercel.app');
  assert.equal(
    sealTree([{ path: 'config.json', sha256: seal }]),
    sealTree([{ path: 'config.json', sha256: seal }])
  );
  assert.throws(
    () => sealTree([{ path: '../config.json', sha256: seal }]),
    /seal is missing/
  );
});

test('output listing hashes the opened file and refuses a symlink', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mail-seal-'));
  try {
    const nested = path.join(dir, 'static');
    mkdirSync(nested);
    writeFileSync(path.join(nested, 'app.js'), 'legacy');
    const files = listOutput(dir);
    assert.deepEqual(
      files.map((file) => file.path),
      ['static/app.js']
    );
    assert.match(files[0].sha256, /^[a-f0-9]{64}$/u);
    symlinkSync(path.join(nested, 'app.js'), path.join(dir, 'linked.js'));
    assert.throws(() => listOutput(dir), /output symlink refused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the new workflow is dispatch-only and the general Mail publisher stays held', () => {
  const workflow = readFileSync(
    path.join(root, '.github/workflows/mail-vercel-exact-sha.yaml'),
    'utf8'
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /main_sha:/);
  assert.match(workflow, /required: true/);
  assert.doesNotMatch(workflow, /workflow_call:|pull_request:|^\s*push:/m);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/
  );
  assert.match(workflow, /environment: vercel-production-mail/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /deployments: write/);
  assert.doesNotMatch(workflow, /checks: write|contents: write|write-all/);
  assert.doesNotMatch(
    workflow,
    /--token|vercel build|vercel deploy|vercel promote/
  );
  assert.match(
    workflow,
    /node scripts\/ci\/mail-exact-sha-publisher\.mjs publish/
  );
  assert.doesNotMatch(
    workflow,
    /production-publication-policy|record-vercel-deployment/
  );
});

test('rejects multiline deployment evidence before binding outputs', () => {
  const fields = {
    rollbackId: 'dpl_old',
    stagedId: 'dpl_new',
    rollbackUrl: 'https://old.example.com',
    stagedUrl: 'https://new.example.com',
  };
  for (const key of Object.keys(fields)) {
    assert.throws(
      () => assertPreboundRollback({ ...fields, [key]: fields[key] + '\n' }),
      /invalid deployment output field/u
    );
  }
});
