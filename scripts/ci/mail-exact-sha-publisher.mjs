import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAIL_PRODUCTION_ALIAS = 'mail.tuturuuu.com';
export const MAIL_SUPABASE_HOST = 'nzamlzqfdwaaxdefwraj.supabase.co';
export const LEGACY_BUILD_COMMAND = 'bun run build:legacy';
export const PHASES = [
  'verify-source',
  'prepare-legacy-build',
  'pull',
  'build',
  'seal',
  'stage',
  'guard',
  'bind-rollback',
  'promote',
];

const SHA = /^[a-f0-9]{40}$/u;
const SEAL = /^[a-f0-9]{64}$/u;

export function assertExactSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new Error('A full lowercase main SHA is required');
  }
  return value;
}

export function assertSourceSeal({ head, requested, onMain }) {
  const sha = assertExactSha(requested);
  if (head !== sha) throw new Error('Checkout is not the requested main SHA');
  if (onMain !== true) throw new Error('Requested SHA is not on origin/main');
  return sha;
}

export function legacyVercelJson(current) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error('Mail vercel.json is missing');
  }
  if (/\bvp\b|turbo:local run build\b/u.test(LEGACY_BUILD_COMMAND)) {
    throw new Error('Legacy build command is not legacy');
  }
  return { ...current, buildCommand: LEGACY_BUILD_COMMAND };
}

export function assertLegacyOutput({ config, paths }) {
  if (!config || config.version !== 3 || !Array.isArray(paths)) {
    throw new Error('Legacy Vercel output is missing');
  }
  const configText = JSON.stringify(config);
  const refusedPath = paths.some((item) =>
    /(^|\/)(\.wrangler|void\.config\.ts|vp)(\/|$)/u.test(item)
  );
  if (
    /"void"|\bvp build\b|\.wrangler|void\.config/u.test(configText) ||
    refusedPath
  ) {
    throw new Error('Refusing vp output');
  }
  if (!paths.some((item) => item.startsWith('static/_next/'))) {
    throw new Error('Legacy Vercel output has no Next assets');
  }
}

export function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label} is not a bare HTTPS URL`);
  }
  return url;
}

export function assertSupabaseUrl(value) {
  const url = assertHttpsUrl(value, 'Supabase URL');
  if (
    url.host !== MAIL_SUPABASE_HOST ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('Supabase host rejected');
  }
}

export function assertProject(actual, expected) {
  if (!actual || !expected || actual !== expected) {
    throw new Error('project mismatch');
  }
}

export function assertReady(state) {
  if (state !== 'READY') throw new Error('deployment is not READY');
}

export function assertAliasBeforePromote({ stagedAliases, rollbackAliases }) {
  if ((stagedAliases ?? []).includes(MAIL_PRODUCTION_ALIAS)) {
    throw new Error('staged deployment already owns the mail alias');
  }
  if (!(rollbackAliases ?? []).includes(MAIL_PRODUCTION_ALIAS)) {
    throw new Error('rollback is not bound to the mail alias');
  }
}

export function assertPreboundRollback({
  rollbackId,
  stagedId,
  rollbackUrl,
  stagedUrl,
}) {
  if (!rollbackId || !stagedId || rollbackId === stagedId) {
    throw new Error('rollback is not prebound');
  }
  const rollback = assertHttpsUrl(rollbackUrl, 'rollback URL');
  const staged = assertHttpsUrl(stagedUrl, 'staged URL');
  if (rollback.href === staged.href) {
    throw new Error('rollback is not prebound');
  }
}

export function assertNoToken(argv, token) {
  const joined = argv.join('\n');
  if (
    /--token\b|VERCEL_TOKEN/u.test(joined) ||
    (token && joined.includes(token))
  ) {
    throw new Error('token in argv');
  }
}

export function stageCommand({ sha, seal }) {
  const source = assertExactSha(sha);
  if (!SEAL.test(seal)) throw new Error('output seal is missing');
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
  return stage;
}

export function promoteCommand(stagedUrl) {
  assertHttpsUrl(stagedUrl, 'staged URL');
  const promote = ['promote', stagedUrl, '--yes'];
  assertNoToken(promote);
  return promote;
}

export function sealTree(files) {
  const hash = createHash('sha256');
  const seen = new Set();
  for (const file of files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      file.path.startsWith('/') ||
      file.path.split('/').includes('..') ||
      !SEAL.test(file.sha256) ||
      seen.has(file.path)
    ) {
      throw new Error('output seal is missing');
    }
    seen.add(file.path);
    hash.update(file.path);
    hash.update(file.sha256);
  }
  if (seen.size === 0) throw new Error('output seal is missing');
  return hash.digest('hex');
}

export function normalizeDeployment(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('deployment inspect failed');
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

export function assertPublicationGuards({
  source,
  seal,
  staged,
  rollback,
  supabaseUrl,
  expectedProjectId,
}) {
  const sha = assertExactSha(source);
  if (!SEAL.test(seal)) throw new Error('output seal is missing');
  for (const deployment of [staged, rollback]) {
    assertReady(deployment.readyState);
    assertProject(deployment.projectId, expectedProjectId);
    assertHttpsUrl(deployment.url, 'deployment URL');
  }
  assertSupabaseUrl(supabaseUrl);
  assertAliasBeforePromote({
    stagedAliases: staged.aliases,
    rollbackAliases: rollback.aliases,
  });
  assertPreboundRollback({
    rollbackId: rollback.id,
    stagedId: staged.id,
    rollbackUrl: rollback.url,
    stagedUrl: staged.url,
  });
  if (staged.commitSha && staged.commitSha !== sha) {
    throw new Error('staged deployment commit does not match the main SHA');
  }
  if (staged.mainSha !== sha || staged.outputSeal !== seal) {
    throw new Error('staged deployment seal does not match the main SHA');
  }
}

export async function runPublish(deps) {
  let promoted = false;
  const source = await deps.verifySource();
  await deps.prepareLegacyBuild();
  await deps.pull();
  await deps.build();
  const seal = await deps.seal();
  const staged = await deps.stage(seal);
  const rollback = await deps.inspectAlias();
  assertPublicationGuards({
    source,
    seal,
    staged,
    rollback,
    supabaseUrl: await deps.readSupabaseUrl(),
    expectedProjectId: deps.projectId,
  });
  await deps.bindRollback(rollback);
  if (promoted) throw new Error('promote already ran');
  promoted = true;
  await deps.promote(staged.url);
  return { source, seal, staged, rollback };
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
  if (result.status !== 0) throw new Error('git command failed');
  return result.stdout.trim();
}

function vercel(args, cwd) {
  assertNoToken(args, process.env.VERCEL_TOKEN);
  const result = spawnSync('vercel', args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (
    (process.env.VERCEL_TOKEN &&
      (stdout.includes(process.env.VERCEL_TOKEN) ||
        stderr.includes(process.env.VERCEL_TOKEN))) ||
    result.status !== 0
  ) {
    throw new Error(
      result.status === 0 ? 'token in output' : 'vercel command failed'
    );
  }
  return stdout;
}

function deploymentUrl(stdout) {
  const urls = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^https:\/\/\S+$/u.test(line));
  if (urls.length === 0) throw new Error('staged URL is not a URL');
  return assertHttpsUrl(urls.at(-1), 'staged URL').href;
}

function listOutput(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      const stat = lstatSync(abs);
      if (stat.isSymbolicLink()) throw new Error('output symlink refused');
      if (stat.isDirectory()) walk(abs);
      else if (stat.isFile()) {
        files.push({
          path: rel,
          sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
        });
      }
    }
  };
  walk(rootDir);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
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
  throw new Error('Supabase host rejected');
}

async function inspect(host) {
  const orgId = process.env.VERCEL_ORG_ID;
  const token = process.env.VERCEL_TOKEN;
  if (!orgId || !token || host.includes('/') || host.includes('@')) {
    throw new Error('deployment inspect failed');
  }
  const url = new URL(`https://api.vercel.com/v13/deployments/${host}`);
  url.searchParams.set('teamId', orgId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`deployment inspect failed (${response.status})`);
  return normalizeDeployment(await response.json());
}

function bindRollback(rollback, staged, source, seal) {
  const lines = [
    `rollback_id=${rollback.id}`,
    `rollback_url=${rollback.url}`,
    `staged_url=${staged.url}`,
    `main_sha=${source}`,
    `output_seal=${seal}`,
  ];
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, {
      flag: 'a',
    });
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Mail exact-SHA fallback bound rollback before promote.\n${lines.join('\n')}\n`,
      { flag: 'a' }
    );
  }
}

async function publishReal() {
  const appDir = path.join(process.cwd(), 'apps/mail');
  const requested = assertExactSha(process.env.MAIL_MAIN_SHA);
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_ORG_ID) {
    throw new Error('Vercel credentials are missing');
  }
  git(['rev-parse', '--verify', `${requested}^{commit}`]);
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', requested, 'origin/main'],
    { encoding: 'utf8' }
  );
  if (ancestor.status !== 0)
    throw new Error('Requested SHA is not on origin/main');
  git(['checkout', '--detach', requested]);
  let seal = '';
  let staged;
  await runPublish({
    projectId: process.env.VERCEL_PROJECT_ID,
    verifySource() {
      return assertSourceSeal({
        head: git(['rev-parse', 'HEAD']),
        requested,
        onMain: true,
      });
    },
    prepareLegacyBuild() {
      const file = path.join(appDir, 'vercel.json');
      const next = legacyVercelJson(JSON.parse(readFileSync(file, 'utf8')));
      writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    },
    pull() {
      vercel(['pull', '--yes', '--environment=production'], appDir);
    },
    build() {
      vercel(['build', '--prod'], appDir);
    },
    seal() {
      const output = path.join(appDir, '.vercel', 'output');
      const files = listOutput(output);
      const config = JSON.parse(
        readFileSync(path.join(output, 'config.json'), 'utf8')
      );
      assertLegacyOutput({
        config,
        paths: files.map((file) => file.path),
      });
      seal = sealTree(files);
      return seal;
    },
    async stage(outputSeal) {
      const stdout = vercel(
        stageCommand({ sha: requested, seal: outputSeal }),
        appDir
      );
      staged = await inspect(new URL(deploymentUrl(stdout)).host);
      return staged;
    },
    inspectAlias: () => inspect(MAIL_PRODUCTION_ALIAS),
    readSupabaseUrl: () => readSupabaseUrl(appDir),
    bindRollback(rollback) {
      bindRollback(rollback, staged, requested, seal);
    },
    promote(url) {
      vercel(promoteCommand(url), appDir);
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] !== 'publish') {
    console.error('usage: mail-exact-sha-publisher.mjs publish');
    process.exit(1);
  }
  publishReal().catch((error) => {
    console.error(redact(error?.message || 'publish failed'));
    process.exit(1);
  });
}
