const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const WORKFLOW =
  'tutur3u/platform/.github/workflows/e2e-smoke-report-only.yaml@refs/heads/main';

function plan(env = process.env, home = os.homedir()) {
  if (
    env.CI !== 'true' ||
    env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
    env.GITHUB_WORKFLOW_REF !== WORKFLOW ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.RUNNER_ENVIRONMENT !== 'self-hosted' ||
    env.RUNNER_OS !== 'macOS' ||
    !['push', 'schedule', 'workflow_dispatch'].includes(
      env.GITHUB_EVENT_NAME
    ) ||
    !/^\d+$/.test(env.GITHUB_RUN_ID || '') ||
    !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ||
    !env.GITHUB_WORKSPACE ||
    !env.RUNNER_TEMP
  ) {
    throw new Error(
      'Docker exception is limited to the trusted main Web E2E fleet workflow'
    );
  }
  const identity = `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const project = `ttr-e2e-report-${identity}`;
  return {
    identity,
    project,
    root: env.GITHUB_WORKSPACE,
    lock: path.join(home, '.tuturuuu', 'ci-web-e2e.lock'),
    env: {
      ...env,
      COMPOSE_PROJECT_NAME: project,
      DOCKER_WEB_COMPOSE_PROJECT_NAME: project,
      DOCKER_BACKEND_ENABLED: '0',
      E2E_DOCKER_WEB_CRON_RUNNER_ENABLED: '0',
      DOCKER_WEB_CRON_RUNNER_ENABLED: '0',
      E2E_DOCKER_NATIVE_BUILD: '0',
      E2E_DOCKER_NATIVE_SUPPORT_BUILD: '0',
      E2E_DOCKER_BUILDKIT_PRUNE_AFTER_BUILD: '0',
      E2E_KEEP_DOCKER_STACK: '0',
      E2E_REUSE_LOCAL_REDIS: '0',
      E2E_REUSED_LOCAL_REDIS: '0',
      E2E_DOCKER_REUSE_WEB_IMAGE: '0',
      E2E_DOCKER_REUSE_WEB_IMAGE_SOURCE: '',
      DOCKER_WEB_REUSED_WEB_IMAGE_SOURCE: '',
      DOCKER_WEB_SKIP_BLUE_GREEN_WEB_BUILD: '0',
      DOCKER_WEB_SKIP_BLUE_GREEN_SUPPORT_BUILD: '0',
      PORTLESS_PORT: '1355',
      PORTLESS_STATE_DIR: path.join(env.RUNNER_TEMP, project, 'portless'),
    },
  };
}

function argsFor(mode) {
  const common = [
    '--grep-invert',
    '@quarantine',
    '--reporter=line,html',
    '--trace=retain-on-failure',
  ];
  if (mode === 'smoke')
    return [
      ...common,
      '--grep',
      '@smoke',
      '--retries=0',
      '--global-timeout=330000',
    ];
  if (mode === 'nightly') return [...common, '--global-timeout=2400000'];
  throw new Error('Expected smoke or nightly');
}

function command(p, executable, args, capture = false) {
  return execFileSync(executable, args, {
    cwd: p.root,
    env: p.env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: 180_000,
  });
}

function claim(p, run = command) {
  fs.mkdirSync(path.dirname(p.lock), { recursive: true });
  fs.mkdirSync(p.lock, { mode: 0o700 });
  const config = path.join(p.root, 'apps/database/supabase/config.toml');
  const original = fs.readFileSync(config, 'utf8');
  const projectLine = original.match(/^project_id = "[^"]+"$/m)?.[0];
  const owner = {
    pid: process.pid,
    identity: p.identity,
    root: p.root,
    admitted: false,
    projectLine,
  };
  const ownerFile = path.join(p.lock, 'owner.json');
  fs.writeFileSync(ownerFile, JSON.stringify(owner), { mode: 0o600 });
  try {
    if (!projectLine) throw new Error('Missing local Supabase project id');
    if (run(p, 'docker', ['ps', '-q'], true).trim()) {
      throw new Error(
        'Fleet Docker daemon is busy; refusing to touch existing containers'
      );
    }
    // Fixed local auth origins require these ports. Refuse an existing runtime.
    const ports = [1355, 7803, 7809, 8000, 8001, 8002, 8003, 8004, 8007, 8009];
    for (const port of ports) {
      try {
        const listeners = run(
          p,
          'lsof',
          ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
          true
        );
        if (listeners.trim()) throw new Error(`Fleet port ${port} is busy`);
      } catch (error) {
        // lsof uses exit 1 for no matching listeners; other errors fail closed.
        if (error.status !== 1) throw error;
      }
    }
    fs.writeFileSync(
      config,
      original.replace(projectLine, `project_id = "${p.project}"`)
    );
    owner.admitted = true;
    fs.writeFileSync(ownerFile, JSON.stringify(owner), { mode: 0o600 });
  } catch (error) {
    fs.rmSync(p.lock, { recursive: true });
    throw error;
  }
}

function cleanup(p, run = command) {
  const ownerFile = path.join(p.lock, 'owner.json');
  if (!fs.existsSync(ownerFile)) return;
  const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  if (owner.identity !== p.identity || owner.root !== p.root) return;
  try {
    process.kill(owner.pid, 0);
    throw new Error('Run process is still alive; retaining the host lock');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  if (owner.admitted) {
    // Use only this run's compose project and Supabase project. No global prune.
    const envFile = path.join(p.root, 'tmp/e2e/web.env');
    if (fs.existsSync(envFile)) {
      run(p, 'node', [
        'scripts/docker-web.js',
        'down',
        '--mode',
        'prod',
        '--strategy',
        'blue-green',
        '--env-file',
        'tmp/e2e/web.env',
        '--volumes',
      ]);
    }
    run(p, 'bun', ['sb:stop']);
    run(p, 'bunx', ['--no-install', 'portless', 'proxy', 'stop']);
    for (const label of [
      `com.docker.compose.project=${p.project}`,
      `com.supabase.cli.project=${p.project}`,
    ]) {
      if (
        run(
          p,
          'docker',
          ['ps', '-aq', '--filter', `label=${label}`],
          true
        ).trim()
      ) {
        throw new Error('Owned E2E containers remain; retaining the host lock');
      }
    }
    const config = path.join(p.root, 'apps/database/supabase/config.toml');
    fs.writeFileSync(
      config,
      fs
        .readFileSync(config, 'utf8')
        .replace(`project_id = "${p.project}"`, owner.projectLine)
    );
  }
  fs.rmSync(p.lock, { recursive: true });
}

async function main() {
  const p = plan();
  if (fs.realpathSync(process.cwd()) !== fs.realpathSync(p.root)) {
    throw new Error('Run from the workflow checkout');
  }
  const mode = process.argv[2];
  if (mode === 'cleanup') return cleanup(p);
  const args = argsFor(mode);
  if ((mode === 'nightly') !== (p.env.GITHUB_EVENT_NAME === 'schedule')) {
    throw new Error('Only the scheduled event admits the full suite');
  }
  claim(p);
  Object.assign(process.env, p.env);
  // Deliberately bypass only the paused package alias in this admitted wrapper.
  // Rust, TanStack, the cron runner and all other Docker entrypoints stay paused.
  const { runWebE2E } = require('../run-web-e2e-docker.js');
  await runWebE2E(args, { frontend: 'next', playwrightArgs: args });
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { plan, argsFor, claim, cleanup };
