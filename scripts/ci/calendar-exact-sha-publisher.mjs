// Stage-only exact-SHA Vercel publisher for Calendar. It builds one main SHA
// with Calendar's committed vercel.json recipe, stages it with --skip-domain,
// and proves the production alias did not move. Its only mode is `stage`, and
// that mode ends with the deployment staged: the Vercel subcommand allowlist
// below has no promote, alias, rollback or remove, so promotion stays with the
// release owner's separately approved method. Every stop carries a fixed
// guardCode and the phase it stopped in.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertSafeOutputTree,
  listOutput,
  sealTree,
  sensitiveNameCode,
} from './calendar-exact-sha-output.mjs';
import {
  StageStop,
  asStop,
  formatStop,
  inPhase,
  stop,
  stopRecord,
} from './calendar-exact-sha-stop.mjs';

export {
  GUARD_CODES,
  StageStop,
  formatStop,
  stopRecord,
} from './calendar-exact-sha-stop.mjs';
export {
  assertSafeOutputTree,
  listOutput,
  sealTree,
} from './calendar-exact-sha-output.mjs';

export const CALENDAR_PRODUCTION_ALIAS = 'calendar.tuturuuu.com';
export const CALENDAR_SUPABASE_HOST = 'nzamlzqfdwaaxdefwraj.supabase.co';
// Bounded dependency builds first, then the legacy Next build.
export const CALENDAR_LEGACY_BUILD_COMMAND =
  "cd ../.. && bun turbo:local run build --filter='@tuturuuu/calendar^...' && bun run --cwd apps/calendar build:legacy";
export const MODES = ['stage'];
export const VERCEL_SUBCOMMANDS = ['pull', 'build', 'deploy'];
export const PHASES = [
  'verify-source',
  'verify-legacy-build',
  'alias-preimage',
  'pull',
  'build',
  'sensitive-output',
  'seal',
  'stage',
  'guard',
  'alias-readback',
  'record',
];

const SHA = /^[a-f0-9]{40}$/u;
const SEAL = /^[a-f0-9]{64}$/u;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/u;

export function assertExactSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw stop('SOURCE_SHA_INVALID', 'A full lowercase main SHA is required');
  }
  return value;
}

export function assertSourceSeal({ head, requested, onMain }) {
  const sha = assertExactSha(requested);
  if (head !== sha) {
    throw stop(
      'SOURCE_HEAD_MISMATCH',
      'Checkout is not the requested main SHA'
    );
  }
  if (onMain !== true) {
    throw stop('SOURCE_NOT_ON_MAIN', 'Requested SHA is not on origin/main');
  }
  return sha;
}

// The release owner names the deployment the alias must keep serving, as its
// full source SHA or its dpl_ id.
export function assertAliasPreimageInput(value) {
  if (
    typeof value !== 'string' ||
    !(SHA.test(value) || DEPLOYMENT_ID.test(value))
  ) {
    throw stop(
      'ALIAS_PREIMAGE_INPUT_INVALID',
      'An alias preimage SHA or deployment id is required'
    );
  }
  return value;
}

export function assertMode(mode) {
  if (!MODES.includes(mode)) {
    throw stop('USAGE_MODE', 'usage: calendar-exact-sha-publisher.mjs stage');
  }
  return mode;
}

export function assertVercelSubcommand(args) {
  if (!Array.isArray(args) || !VERCEL_SUBCOMMANDS.includes(args[0])) {
    throw stop('VERCEL_SUBCOMMAND_REFUSED', 'vercel subcommand refused');
  }
}

// Calendar's committed vercel.json already builds the legacy Next output. The
// publisher uses it unchanged and refuses any other recipe.
export function assertLegacyBuildCommand(current) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw stop('BUILD_RECIPE_NOT_LEGACY', 'Calendar vercel.json is missing');
  }
  if (current.buildCommand !== CALENDAR_LEGACY_BUILD_COMMAND) {
    throw stop(
      'BUILD_RECIPE_NOT_LEGACY',
      'Calendar vercel.json build command is not legacy'
    );
  }
  return current;
}

export function assertLegacyOutput({ config, paths }) {
  if (!config || config.version !== 3 || !Array.isArray(paths)) {
    throw stop('OUTPUT_MISSING', 'Legacy Vercel output is missing');
  }
  for (const item of paths) {
    for (const segment of item.split('/')) {
      const code = sensitiveNameCode(segment);
      if (code) throw stop(code, 'sensitive output path refused');
    }
  }
  const configText = JSON.stringify(config);
  const refusedPath = paths.some((item) =>
    /(^|\/)(\.wrangler|void\.config\.ts|vp)(\/|$)/u.test(item)
  );
  if (
    /"void"|\bvp build\b|\.wrangler|void\.config/u.test(configText) ||
    refusedPath
  ) {
    throw stop('OUTPUT_NATIVE_ARTIFACT', 'Refusing vp output');
  }
  // Calendar serves under the /calendar basePath.
  if (
    !paths.some(
      (item) =>
        item.startsWith('static/calendar/_next/') ||
        item.startsWith('static/_next/')
    )
  ) {
    throw stop(
      'OUTPUT_NO_NEXT_ASSETS',
      'Legacy Vercel output has no Next assets'
    );
  }
}

export function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw stop('URL_NOT_HTTPS', `${label} is not a URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw stop('URL_NOT_HTTPS', `${label} is not a bare HTTPS URL`);
  }
  return url;
}

export function assertSupabaseUrl(value) {
  const url = assertHttpsUrl(value, 'Supabase URL');
  if (
    url.host !== CALENDAR_SUPABASE_HOST ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw stop('SUPABASE_HOST_REJECTED', 'Supabase host rejected');
  }
}

export function assertProject(actual, expected) {
  if (!actual || !expected || actual !== expected) {
    throw stop('PROJECT_MISMATCH', 'project mismatch');
  }
}

export function assertReady(state) {
  if (state !== 'READY') {
    throw stop('DEPLOYMENT_NOT_READY', 'deployment is not READY');
  }
}

function isExactCalendarAlias(alias) {
  if (alias !== CALENDAR_PRODUCTION_ALIAS) return false;
  let url;
  try {
    url = new URL(`https://${alias}`);
  } catch {
    return false;
  }
  return (
    url.hostname === CALENDAR_PRODUCTION_ALIAS &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === ''
  );
}

export function assertAliasPreimage({ live, expected, expectedProjectId }) {
  const want = assertAliasPreimageInput(expected);
  assertReady(live.readyState);
  assertProject(live.projectId, expectedProjectId);
  assertHttpsUrl(live.url, 'alias deployment URL');
  if (!live.id || !(live.aliases ?? []).some(isExactCalendarAlias)) {
    throw stop(
      'ALIAS_PREIMAGE_UNBOUND',
      'alias preimage is not bound to the calendar alias'
    );
  }
  const matches = DEPLOYMENT_ID.test(want)
    ? live.id === want
    : live.commitSha === want || live.mainSha === want;
  if (!matches) {
    throw stop(
      'ALIAS_PREIMAGE_MISMATCH',
      'alias preimage is not the expected deployment'
    );
  }
  return live;
}

export function assertAliasUnchanged({ before, after, staged }) {
  if (
    !before?.id ||
    !after?.id ||
    after.id !== before.id ||
    after.url !== before.url ||
    !(after.aliases ?? []).some(isExactCalendarAlias)
  ) {
    throw stop('ALIAS_MOVED', 'calendar alias moved during staging');
  }
  if (staged.id === after.id) {
    throw stop(
      'STAGED_OWNS_ALIAS',
      'staged deployment already owns the calendar alias'
    );
  }
}

export function assertNoToken(argv, token) {
  const joined = argv.join('\n');
  if (
    /--token\b|VERCEL_TOKEN/u.test(joined) ||
    (token && joined.includes(token))
  ) {
    throw stop('TOKEN_IN_ARGV', 'token in argv');
  }
}

export function stageCommand({ sha, seal }) {
  const source = assertExactSha(sha);
  if (!SEAL.test(seal)) {
    throw stop('OUTPUT_SEAL_INVALID', 'output seal is missing');
  }
  const stage = [
    'deploy',
    '--archive=tgz',
    '--prebuilt',
    '--prod',
    '--skip-domain',
    '--meta',
    `mainSha=${source}`,
    '--meta',
    `outputSeal=${seal}`,
  ];
  assertNoToken(stage);
  assertVercelSubcommand(stage);
  return stage;
}

export function normalizeDeployment(body) {
  if (!body || typeof body !== 'object') {
    throw stop('DEPLOYMENT_INSPECT_FAILED', 'deployment inspect failed');
  }
  const host =
    typeof body.url === 'string' ? body.url.replace(/^https:\/\//u, '') : '';
  return {
    id: body.id || body.uid || '',
    url: host ? `https://${host}` : '',
    readyState: body.readyState || '',
    projectId: body.projectId || '',
    aliases: Array.isArray(body.alias) ? body.alias : [],
    commitSha: body.meta?.githubCommitSha || '',
    mainSha: body.meta?.mainSha || '',
    outputSeal: body.meta?.outputSeal || '',
  };
}

export function assertStageGuards({
  source,
  seal,
  staged,
  supabaseUrl,
  expectedProjectId,
}) {
  const sha = assertExactSha(source);
  if (!SEAL.test(seal)) {
    throw stop('OUTPUT_SEAL_INVALID', 'output seal is missing');
  }
  assertReady(staged.readyState);
  assertProject(staged.projectId, expectedProjectId);
  assertHttpsUrl(staged.url, 'deployment URL');
  if (!staged.id) {
    throw stop('STAGED_ID_MISSING', 'staged deployment id is missing');
  }
  assertSupabaseUrl(supabaseUrl);
  if ((staged.aliases ?? []).some(isExactCalendarAlias)) {
    throw stop(
      'STAGED_OWNS_ALIAS',
      'staged deployment already owns the calendar alias'
    );
  }
  if (staged.commitSha && staged.commitSha !== sha) {
    throw stop(
      'STAGED_COMMIT_MISMATCH',
      'staged deployment commit does not match the main SHA'
    );
  }
  if (staged.mainSha !== sha || staged.outputSeal !== seal) {
    throw stop(
      'STAGED_SEAL_MISMATCH',
      'staged deployment seal does not match the main SHA'
    );
  }
}

export function preimageRecord(live) {
  return [
    `alias=${CALENDAR_PRODUCTION_ALIAS}`,
    `alias_preimage_id=${live.id}`,
    `alias_preimage_url=${live.url}`,
    `alias_preimage_sha=${live.commitSha || live.mainSha || ''}`,
  ];
}

export function stagedRecord({ staged, source, seal, ref, runId, alias }) {
  return [
    'terminal_state=staged',
    `staged_id=${staged.id}`,
    `staged_url=${staged.url}`,
    `main_sha=${source}`,
    `output_seal=${seal}`,
    `source_ref=${ref ?? ''}`,
    `run_id=${runId ?? ''}`,
    `alias_readback_id=${alias.id}`,
  ];
}

// The terminal state is `staged`. No dependency can promote or alias, and any
// failure leaves as a StageStop carrying its guardCode and phase.
export async function runStage(deps) {
  const step = (phase, fn) => inPhase(phase, fn, deps.redact);
  const source = await step('verify-source', () => deps.verifySource());
  await step('verify-legacy-build', () => deps.verifyLegacyBuild());
  const before = await step('alias-preimage', async () => {
    const live = assertAliasPreimage({
      live: await deps.inspectAlias(),
      expected: deps.aliasPreimage,
      expectedProjectId: deps.projectId,
    });
    await deps.recordPreimage(live);
    return live;
  });
  await step('pull', () => deps.pull());
  await step('build', () => deps.build());
  await step('sensitive-output', () => deps.assertSensitiveOutput());
  const seal = await step('seal', () => deps.seal());
  const staged = await step('stage', () => deps.stage(seal));
  await step('guard', async () =>
    assertStageGuards({
      source,
      seal,
      staged,
      supabaseUrl: await deps.readSupabaseUrl(),
      expectedProjectId: deps.projectId,
    })
  );
  const after = await step('alias-readback', async () => {
    const live = await deps.inspectAlias();
    assertAliasUnchanged({ before, after: live, staged });
    return live;
  });
  await step('record', () =>
    deps.record({ source, seal, staged, alias: after })
  );
  return { state: 'staged', source, seal, staged, alias: after };
}

function redact(message) {
  const token = process.env.VERCEL_TOKEN;
  return token
    ? String(message).split(token).join('[redacted]')
    : String(message);
}

function git(args) {
  assertNoToken(args, process.env.VERCEL_TOKEN);
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw stop('GIT_COMMAND_FAILED', 'git command failed');
  }
  return result.stdout.trim();
}

// The only path to the Vercel CLI. The subcommand allowlist runs before the
// process is spawned, so promote/alias/rollback/remove never execute.
export function runVercel(args, cwd, spawn = spawnSync, env = process.env) {
  assertVercelSubcommand(args);
  assertNoToken(args, env.VERCEL_TOKEN);
  const result = spawn('vercel', args, { cwd, encoding: 'utf8', env });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (
    env.VERCEL_TOKEN &&
    (stdout.includes(env.VERCEL_TOKEN) || stderr.includes(env.VERCEL_TOKEN))
  ) {
    throw stop('TOKEN_IN_OUTPUT', 'token in output');
  }
  if (result.status !== 0) {
    throw stop('VERCEL_COMMAND_FAILED', 'vercel command failed');
  }
  return stdout;
}

function deploymentUrl(stdout) {
  const urls = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^https:\/\/\S+$/u.test(line));
  if (urls.length === 0) {
    throw stop('STAGED_URL_INVALID', 'staged URL is not a URL');
  }
  return assertHttpsUrl(urls.at(-1), 'staged URL').href;
}

function readSupabaseUrl(appDir) {
  const file = readFileSync(
    path.join(appDir, '.vercel', '.env.production.local'),
    'utf8'
  );
  for (const line of file.split('\n')) {
    if (!line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) continue;
    return line
      .slice('NEXT_PUBLIC_SUPABASE_URL='.length)
      .replace(/^"|"$/gu, '');
  }
  throw stop('SUPABASE_HOST_REJECTED', 'Supabase host rejected');
}

async function inspect(host) {
  const orgId = process.env.VERCEL_ORG_ID;
  const token = process.env.VERCEL_TOKEN;
  if (!orgId || !token || host.includes('/') || host.includes('@')) {
    throw stop('DEPLOYMENT_INSPECT_FAILED', 'deployment inspect failed');
  }
  const url = new URL(`https://api.vercel.com/v13/deployments/${host}`);
  url.searchParams.set('teamId', orgId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw stop(
      'DEPLOYMENT_INSPECT_FAILED',
      `deployment inspect failed (${response.status})`
    );
  }
  return normalizeDeployment(await response.json());
}

function record(heading, lines) {
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, {
      flag: 'a',
    });
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${heading}\n${lines.join('\n')}\n`,
      { flag: 'a' }
    );
  }
}

async function stageReal(mode) {
  await inPhase('inputs', () => assertMode(mode), redact);
  const appDir = path.join(process.cwd(), 'apps/calendar');
  const output = path.join(appDir, '.vercel', 'output');
  const { requested, aliasPreimage } = await inPhase(
    'inputs',
    () => {
      const requested = assertExactSha(process.env.CALENDAR_MAIN_SHA);
      const aliasPreimage = assertAliasPreimageInput(
        process.env.CALENDAR_ALIAS_PREIMAGE
      );
      if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_ORG_ID) {
        throw stop('CREDENTIALS_MISSING', 'Vercel credentials are missing');
      }
      return { requested, aliasPreimage };
    },
    redact
  );
  const vercel = (args) => runVercel(args, appDir);
  await runStage({
    projectId: process.env.VERCEL_PROJECT_ID,
    aliasPreimage,
    redact,
    verifySource() {
      git(['rev-parse', '--verify', `${requested}^{commit}`]);
      const ancestor = spawnSync(
        'git',
        ['merge-base', '--is-ancestor', requested, 'origin/main'],
        { encoding: 'utf8' }
      );
      if (ancestor.status !== 0) {
        throw stop('SOURCE_NOT_ON_MAIN', 'Requested SHA is not on origin/main');
      }
      git(['checkout', '--detach', requested]);
      return assertSourceSeal({
        head: git(['rev-parse', 'HEAD']),
        requested,
        onMain: true,
      });
    },
    verifyLegacyBuild() {
      assertLegacyBuildCommand(
        JSON.parse(readFileSync(path.join(appDir, 'vercel.json'), 'utf8'))
      );
    },
    inspectAlias: () => inspect(CALENDAR_PRODUCTION_ALIAS),
    recordPreimage(live) {
      record('Calendar alias preimage before staging.', preimageRecord(live));
    },
    pull: () => vercel(['pull', '--yes', '--environment=production']),
    build: () => vercel(['build', '--prod']),
    assertSensitiveOutput: () => assertSafeOutputTree(output),
    seal() {
      const files = listOutput(output);
      const config = JSON.parse(
        readFileSync(path.join(output, 'config.json'), 'utf8')
      );
      assertLegacyOutput({ config, paths: files.map((file) => file.path) });
      return sealTree(files);
    },
    async stage(outputSeal) {
      const stdout = vercel(stageCommand({ sha: requested, seal: outputSeal }));
      return inspect(new URL(deploymentUrl(stdout)).host);
    },
    readSupabaseUrl: () => readSupabaseUrl(appDir),
    record({ source, seal, staged, alias }) {
      record(
        'Calendar exact-SHA deployment staged; the alias did not move.',
        stagedRecord({
          staged,
          source,
          seal,
          ref: process.env.GITHUB_REF,
          runId: process.env.GITHUB_RUN_ID,
          alias,
        })
      );
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  stageReal(process.argv[2]).catch((error) => {
    const stopped =
      error instanceof StageStop ? error : asStop(error, 'unknown', redact);
    try {
      record('Calendar exact-SHA stage stopped.', stopRecord(stopped));
    } catch {
      // The stop line below still reaches the job log.
    }
    console.error(redact(formatStop(stopped)));
    process.exit(1);
  });
}
