#!/usr/bin/env node
// Repeatable local end-to-end environment for the Thanh Mac Studio (and any
// macOS host with the same toolchain): isolated Supabase, web dev server,
// Playwright, and mobile integration tests on simulator/emulator.
// Runbook: apps/docs/build/development-tools/thanh-local-e2e.mdx

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSupabaseBinary } from '../../apps/database/scripts/run-supabase.js';
import {
  isPortAvailable,
  listTrackedSupabaseFiles,
  rewriteSupabaseConfig,
} from '../../apps/database/scripts/run-supabase-isolated.js';
import {
  adbReversePorts,
  dockerEnv,
  formatEnvFile,
  helpText,
  isolatedDockerConfigJson,
  loopbackUrl,
  mobileDefines,
  parseCliArgs,
  parseSupabaseStatus,
  playwrightEnv,
  resolveConfig,
  webEnv,
} from './lib.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const databaseDir = path.join(repoRoot, 'apps', 'database');
const webDir = path.join(repoRoot, 'apps', 'web');
const mobileDir = path.join(repoRoot, 'apps', 'mobile');

function log(message) {
  console.log(`[thanh-e2e] ${message}`);
}

function run(
  command,
  args,
  { cwd = repoRoot, env = {}, capture = false } = {}
) {
  const options = { cwd, env: { ...process.env, ...env } };
  if (capture) {
    return execFileSync(command, args, { ...options, encoding: 'utf8' });
  }
  execFileSync(command, args, { ...options, stdio: 'inherit' });
  return '';
}

function tryRun(command, args, options) {
  try {
    return {
      ok: true,
      output: run(command, args, { ...options, capture: true }),
    };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function ensureDirs(config) {
  for (const dir of [
    config.stateDir,
    config.logsDir,
    config.shotsDir,
    config.envDir,
    config.dockerConfigDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(config.dockerConfigDir, 'config.json'),
    isolatedDockerConfigJson()
  );
}

async function supabase(config, args, { capture = false } = {}) {
  const binary = await ensureSupabaseBinary(databaseDir);
  return run(binary, ['--workdir', config.supabaseWorkdir, ...args], {
    cwd: config.supabaseWorkdir,
    env: dockerEnv(config),
    capture,
  });
}

async function stageSupabase(config) {
  const staged = path.join(config.supabaseWorkdir, 'supabase');
  fs.rmSync(staged, { force: true, recursive: true });
  for (const file of listTrackedSupabaseFiles(repoRoot)) {
    const destination = path.join(
      config.supabaseWorkdir,
      file.slice('apps/database/'.length)
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, file), destination);
  }
  const configPath = path.join(staged, 'config.toml');
  fs.writeFileSync(
    configPath,
    rewriteSupabaseConfig(fs.readFileSync(configPath, 'utf8'), {
      basePort: config.supabaseBasePort,
      projectId: config.projectId,
    })
  );
  log(
    `staged ${staged} (project ${config.projectId}, ports ${config.supabaseBasePort}-${config.supabaseBasePort + 7})`
  );
}

async function readStatus(config) {
  return parseSupabaseStatus(
    await supabase(config, ['status', '-o', 'json'], { capture: true })
  );
}

async function writeEnvFiles(config) {
  const status = await readStatus(config);
  fs.writeFileSync(
    path.join(config.envDir, 'web.env'),
    formatEnvFile(webEnv(config, status))
  );
  fs.writeFileSync(
    path.join(config.envDir, 'mobile.json'),
    `${JSON.stringify(mobileDefines(config, status), null, 2)}\n`
  );
  log(`env files written to ${config.envDir}`);
  return status;
}

async function up(config, flags) {
  ensureDirs(config);
  await stageSupabase(config);
  const running = tryRun(
    'docker',
    ['ps', '--filter', `name=_${config.projectId}`, '-q'],
    { env: dockerEnv(config) }
  );
  if (!running.ok)
    throw new Error(`Docker is unavailable: ${running.output.trim()}`);
  if (!running.output.trim()) {
    for (
      let port = config.supabaseBasePort;
      port < config.supabaseBasePort + 8;
      port += 1
    ) {
      if (!(await isPortAvailable(port))) {
        throw new Error(
          `Port ${port} is busy; set TUTURUUU_E2E_SUPABASE_BASE_PORT to a free block.`
        );
      }
    }
    await supabase(config, ['start', '-x', 'vector,logflare']);
  } else {
    log('stack already running; skipping start');
  }
  if (!flags['no-reset']) await supabase(config, ['db', 'reset']);
  await writeEnvFiles(config);
}

function readPid(config) {
  const pid = Number(
    fs.existsSync(config.webPidFile)
      ? fs.readFileSync(config.webPidFile, 'utf8')
      : NaN
  );
  if (!Number.isInteger(pid)) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return response.status;
    } catch {
      // Server still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function web(config, flags) {
  ensureDirs(config);
  if (readPid(config)) {
    log(
      `web already running (pid ${readPid(config)}) on ${loopbackUrl(config.webPort)}`
    );
    return;
  }
  const status = await writeEnvFiles(config);
  if (!flags['skip-prebuild']) {
    // `bun dev:web` watches these dist-exporting packages; build them once.
    for (const pkg of ['types', 'supabase']) {
      run('bun', ['run', 'build'], {
        cwd: path.join(repoRoot, 'packages', pkg),
      });
    }
  }
  const logFile = fs.openSync(path.join(config.logsDir, 'web.log'), 'a');
  const child = spawn(
    path.join(webDir, 'node_modules', '.bin', 'next'),
    ['dev', '-p', String(config.webPort), '--turbopack'],
    {
      cwd: webDir,
      detached: true,
      env: {
        ...process.env,
        ...webEnv(config, status),
        NODE_OPTIONS: '--experimental-require-module',
      },
      stdio: ['ignore', logFile, logFile],
    }
  );
  child.unref();
  fs.writeFileSync(config.webPidFile, String(child.pid));
  log(
    `web starting (pid ${child.pid}); log ${path.join(config.logsDir, 'web.log')}`
  );
  const code = await waitForHttp(
    `${loopbackUrl(config.webPort)}/login`,
    600_000
  );
  log(`web ready on ${loopbackUrl(config.webPort)} (HTTP ${code})`);
}

async function webE2e(config, flags, positionals) {
  const status = await readStatus(config);
  const env = playwrightEnv(config, status);
  if (flags.install)
    run('bunx', ['playwright', 'install', 'chromium'], { cwd: webDir });
  run('bunx', ['playwright', 'test', ...positionals], { cwd: webDir, env });
}

function devices(config) {
  run('xcrun', ['simctl', 'bootstatus', config.iosSimulator, '-b']);
  if (!tryRun('adb', ['-s', config.androidSerial, 'get-state']).ok) {
    const child = spawn(
      'emulator',
      [
        '-avd',
        config.avd,
        '-port',
        String(config.avdPort),
        '-no-window',
        '-no-audio',
        '-no-boot-anim',
        '-no-snapshot-save',
        '-gpu',
        'swiftshader_indirect',
      ],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
  }
  run('adb', ['-s', config.androidSerial, 'wait-for-device']);
  for (let i = 0; i < 120; i += 1) {
    if (
      tryRun('adb', [
        '-s',
        config.androidSerial,
        'shell',
        'getprop',
        'sys.boot_completed',
      ]).output.trim() === '1'
    )
      break;
    execFileSync('sleep', ['2']);
  }
  log(
    `devices ready: ${config.iosSimulator}, ${config.avd} (${config.androidSerial})`
  );
}

function wireAndroid(config) {
  for (const port of adbReversePorts(config)) {
    run('adb', [
      '-s',
      config.androidSerial,
      'reverse',
      `tcp:${port}`,
      `tcp:${port}`,
    ]);
  }
}

async function mobileE2e(config, flags, positionals) {
  const platform = positionals[0];
  if (!['ios', 'android'].includes(platform))
    throw new Error('mobile-e2e needs ios or android.');
  const mode = flags.mode || 'debug';
  if (!['debug', 'profile', 'release'].includes(mode))
    throw new Error('--mode must be debug, profile or release.');
  if (platform === 'ios' && mode !== 'debug')
    throw new Error('iOS simulators only run debug builds.');
  await writeEnvFiles(config);
  if (platform === 'android') wireAndroid(config);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shotsDir = path.join(config.shotsDir, `${platform}-${mode}-${stamp}`);
  fs.mkdirSync(shotsDir, { recursive: true });
  run(
    'flutter',
    [
      'drive',
      '--driver=test_driver/integration_test.dart',
      '--target=integration_test/e2e_flows_test.dart',
      '-d',
      platform === 'ios' ? config.iosSimulator : config.androidSerial,
      `--${mode}`,
      '--flavor',
      'development',
      `--dart-define-from-file=${path.join(config.envDir, 'mobile.json')}`,
    ],
    { cwd: mobileDir, env: { E2E_SHOTS_DIR: shotsDir } }
  );
  log(`screenshots: ${shotsDir}`);
}

async function status(config) {
  const stack = tryRun(
    'docker',
    [
      'ps',
      '--filter',
      `name=_${config.projectId}`,
      '--format',
      '{{.Names}}\t{{.Status}}',
    ],
    { env: dockerEnv(config) }
  );
  console.log(
    stack.ok
      ? stack.output || '(no Supabase containers)'
      : `docker: ${stack.output}`
  );
  const pid = readPid(config);
  console.log(
    pid ? `web: pid ${pid} on ${loopbackUrl(config.webPort)}` : 'web: stopped'
  );
  console.log(
    tryRun('xcrun', ['simctl', 'list', 'devices'])
      .output.split('\n')
      .filter((line) => line.includes('tuturuuu-'))
      .join('\n')
  );
  console.log(tryRun('adb', ['devices']).output.trim());
}

async function doctor(config) {
  const checks = [
    ['node', ['--version']],
    ['bun', ['--version']],
    ['docker', ['version', '--format', '{{.Server.Version}}']],
    ['flutter', ['--version']],
    ['xcrun', ['--show-sdk-path', '--sdk', 'iphonesimulator']],
    ['adb', ['version']],
    ['java', ['--version']],
  ];
  for (const [command, args] of checks) {
    const result = tryRun(command, args, {
      env: command === 'docker' ? dockerEnv(config) : {},
    });
    console.log(
      `${result.ok ? 'ok  ' : 'FAIL'} ${command}: ${result.output.split('\n')[0].slice(0, 100)}`
    );
  }
  console.log(
    `project ${config.projectId}; supabase ${loopbackUrl(config.supabaseApiPort)}; web ${loopbackUrl(config.webPort)}; state ${config.stateDir}`
  );
}

async function down(config, flags) {
  const pid = readPid(config);
  if (pid) {
    process.kill(-pid, 'SIGTERM');
    log(`stopped web (pid ${pid})`);
  }
  fs.rmSync(config.webPidFile, { force: true });
  const args = ['stop', '--project-id', config.projectId];
  if (flags.purge) args.push('--no-backup');
  await supabase(config, args);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, flags, positionals } = parseCliArgs(argv);
  if (command === 'help') {
    console.log(helpText());
    return;
  }
  const config = resolveConfig();
  const handlers = {
    doctor: () => doctor(config),
    up: () => up(config, flags),
    seed: async () => {
      await supabase(config, ['db', 'reset']);
      await writeEnvFiles(config);
    },
    env: () => writeEnvFiles(config),
    web: () => web(config, flags),
    'web-e2e': () => webE2e(config, flags, positionals),
    devices: () => devices(config),
    'mobile-e2e': () => mobileE2e(config, flags, positionals),
    status: () => status(config),
    down: () => down(config, flags),
  };
  await handlers[command]();
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      `[thanh-e2e] ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  });
}
