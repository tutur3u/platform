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
import { ensureFirebaseConfig, readPidFile } from './files.mjs';
import {
  adbReversePorts,
  dockerEnv,
  dummyGoogleServicesJson,
  formatEnvFile,
  helpText,
  isolatedDockerConfigJson,
  KNOWN_SATELLITES,
  loopbackUrl,
  mobileDefines,
  parseCliArgs,
  parseShotMarker,
  parseSupabaseStatus,
  playwrightEnv,
  resolveConfig,
  satelliteEnv,
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

function readPid(file) {
  const pid = readPidFile(file);
  if (pid === null) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function waitForHttp(url, timeoutMs, isAlive = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive())
      throw new Error(`Server for ${url} exited before it was ready`);
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
  const status = await writeEnvFiles(config);
  const running = readPid(config.webPidFile);
  if (!running && !flags['skip-prebuild']) {
    // Web and satellites import these dist-exporting packages (`bun dev:web`
    // watches types/supabase; Calendar resolves internal-api); build once.
    for (const pkg of ['types', 'supabase', 'internal-api']) {
      run('bun', ['run', 'build'], {
        cwd: path.join(repoRoot, 'packages', pkg),
      });
    }
  }
  if (running) {
    log(
      `web already running (pid ${running}); restart with down --web-only to apply env changes`
    );
  } else {
    await startDetached(config, {
      name: 'web',
      command: path.join(webDir, 'node_modules', '.bin', 'next'),
      args: ['dev', '-p', String(config.webPort), '--turbopack'],
      cwd: webDir,
      env: {
        ...webEnv(config, status),
        NODE_OPTIONS: '--experimental-require-module',
      },
      pidFile: config.webPidFile,
      readyUrl: `${loopbackUrl(config.webPort)}/login`,
    });
  }
  for (const name of config.satellites) {
    const port = KNOWN_SATELLITES[name];
    if (readPid(config.pidFile(name))) {
      log(`${name} already running on ${loopbackUrl(port)}`);
      continue;
    }
    if (!(await isPortAvailable(port))) {
      throw new Error(
        `${name} port ${port} is busy; stop the other server first.`
      );
    }
    await startDetached(config, {
      name,
      // Next.js runtime: Vite+ `dev:app` runs the app in workerd, which cannot
      // load CommonJS workspace dist (e.g. @tuturuuu/internal-api).
      command: path.join(
        repoRoot,
        'apps',
        name,
        'node_modules',
        '.bin',
        'next'
      ),
      args: ['dev', '-p', String(port), '--turbopack'],
      cwd: path.join(repoRoot, 'apps', name),
      env: {
        ...satelliteEnv(config, status, name),
        NODE_OPTIONS: '--experimental-require-module',
      },
      pidFile: config.pidFile(name),
      readyUrl: `${loopbackUrl(port)}/`,
    });
  }
}

// Starts a long-lived dev server in its own process group, logging to
// logs/<name>.log, and waits until it answers HTTP below 500.
async function startDetached(
  config,
  { name, command, args, cwd, env, pidFile, readyUrl }
) {
  const logPath = path.join(config.logsDir, `${name}.log`);
  const logFile = fs.openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ['ignore', logFile, logFile],
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  log(`${name} starting (pid ${child.pid}); log ${logPath}`);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  const code = await waitForHttp(readyUrl, 600_000, () => !exited);
  log(`${name} ready on ${new URL(readyUrl).origin} (HTTP ${code})`);
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

// Gitignored Firebase inputs, prepared the same way as mobile CI.
function prepareFirebase(platform) {
  if (platform === 'ios') {
    run('python3', [
      '-I',
      path.join(
        repoRoot,
        'scripts',
        'mobile-deployment',
        'firebase-service-config.py'
      ),
      '--platform',
      'ios',
      '--mobile-root',
      mobileDir,
    ]);
    return;
  }
  const target = path.join(mobileDir, 'android', 'app', 'google-services.json');
  ensureFirebaseConfig(target, dummyGoogleServicesJson());
}

const DRIVE_TIMEOUT_MS = 20 * 60_000;

// Streams `flutter drive`, capturing a host screenshot for each E2E_SHOT marker.
function driveWithScreenshots({ args, capture, logFile, shotsDir }) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(logFile);
    // Own process group: a killed drive otherwise orphans its dev service and
    // driver, which keep stdout open and pin the ttr resources slot.
    const child = spawn('flutter', args, {
      cwd: mobileDir,
      detached: true,
      env: process.env,
    });
    const killGroup = () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Group already exited.
      }
    };
    let buffer = '';
    let passed = false;
    const timer = setTimeout(() => {
      log(
        `flutter drive exceeded ${DRIVE_TIMEOUT_MS / 60_000} minutes; stopping it`
      );
      killGroup();
    }, DRIVE_TIMEOUT_MS);
    const onData = (chunk) => {
      process.stdout.write(chunk);
      out.write(chunk);
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.includes('All tests passed')) passed = true;
        const name = parseShotMarker(line);
        if (!name) continue;
        try {
          capture(path.join(shotsDir, `${name}.png`));
          log(`captured ${name}`);
        } catch (error) {
          log(`screenshot ${name} failed: ${error.message}`);
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      killGroup();
      out.end();
      // A killed or crashed drive can exit 0; only the pass line counts.
      resolve(code === 0 && passed ? 0 : code || 1);
    });
  });
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
  prepareFirebase(platform);
  if (platform === 'android') wireAndroid(config);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shotsDir = path.join(config.shotsDir, `${platform}-${mode}-${stamp}`);
  fs.mkdirSync(shotsDir, { recursive: true });
  const device =
    platform === 'ios' ? config.iosSimulator : config.androidSerial;
  const code = await driveWithScreenshots({
    args: [
      'drive',
      '--driver=test_driver/integration_test.dart',
      '--target=integration_test/e2e_flows_test.dart',
      '-d',
      device,
      `--${mode}`,
      '--flavor',
      'development',
      `--dart-define-from-file=${path.join(config.envDir, 'mobile.json')}`,
    ],
    capture: (file) =>
      platform === 'ios'
        ? run('xcrun', ['simctl', 'io', device, 'screenshot', file], {
            capture: true,
          })
        : fs.writeFileSync(
            file,
            execFileSync('adb', ['-s', device, 'exec-out', 'screencap', '-p'], {
              maxBuffer: 64 * 1024 * 1024,
            })
          ),
    logFile: path.join(shotsDir, 'flutter-drive.log'),
    shotsDir,
  });
  log(`screenshots: ${shotsDir}`);
  if (code !== 0) throw new Error(`flutter drive exited with ${code}`);
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
  const pid = readPid(config.webPidFile);
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
  for (const [name, file] of [
    ['web', config.webPidFile],
    ...config.satellites.map((sat) => [sat, config.pidFile(sat)]),
  ]) {
    const pid = readPid(file);
    if (pid) {
      process.kill(-pid, 'SIGTERM');
      log(`stopped ${name} (pid ${pid})`);
    }
    fs.rmSync(file, { force: true });
  }
  if (flags['web-only']) return;
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
