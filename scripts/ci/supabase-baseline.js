#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  FORMAT,
  baselineKey,
  migrationVersions,
  validateManifest,
} = require('./supabase-baseline-key.js');

const root = path.resolve(__dirname, '../..');
const database = path.join(root, 'apps/database');
const wrapper = path.join(database, 'scripts/run-supabase.js');
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: database,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}
const cli = (...args) => run(process.execPath, [wrapper, ...args]);
const docker = (...args) => run('docker', args);
function output(name, value) {
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  else console.log(`${name}=${value}`);
}
function checksum(file) {
  return run('sha256sum', [file]).split(/\s+/)[0];
}
function existsVolume(name) {
  return docker('volume', 'ls', '--format', '{{.Name}}')
    .split('\n')
    .includes(name);
}
function identity() {
  const services = JSON.parse(cli('services', '-o', 'json'));
  const postgres = services.find(
    (service) => service.name === 'supabase/postgres'
  );
  if (!postgres?.local || !/^[\w.-]+$/.test(postgres.local))
    throw new Error('Missing Postgres version');
  const key = baselineKey({
    root,
    cliVersion: cli('--version'),
    services,
    arch: process.arch,
    platform: process.platform,
  });
  return { key, image: `public.ecr.aws/supabase/postgres:${postgres.local}` };
}
function verifyHistory(container) {
  const actual = docker(
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-Atc',
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;'
  )
    .split('\n')
    .filter(Boolean)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(migrationVersions(root))) {
    throw new Error(
      'Supabase baseline migration history does not match this checkout'
    );
  }
}

function prepare({ key, image }) {
  // Never snapshot a developer or production database. Each CI job starts empty.
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Invoked directly by GitHub Actions, not Turbo.
  if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'linux') {
    throw new Error(
      'Baseline preparation requires a fresh Linux GitHub Actions runner'
    );
  }
  const config = fs.readFileSync(
    path.join(database, 'supabase/config.toml'),
    'utf8'
  );
  const project = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
  if (!project) throw new Error('Invalid local Supabase project id');
  const volume = `supabase_db_${project}`;
  const container = volume;
  if (
    existsVolume(volume) ||
    docker('ps', '-a', '--format', '{{.Names}}').split('\n').includes(container)
  ) {
    throw new Error(
      'Refusing to snapshot or overwrite an existing Supabase database'
    );
  }
  const directory = path.resolve(
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Direct CI snapshot helper override.
    process.env.SUPABASE_BASELINE_DIR ||
      path.join(process.env.RUNNER_TEMP, 'supabase-baseline')
  );
  fs.mkdirSync(directory, { recursive: true });
  const archive = path.join(directory, 'database.tar.gz');
  const manifestPath = path.join(directory, 'manifest.json');
  let restored = false;
  let createdVolume = false;
  const start = () =>
    cli('start', '--exclude', 'edge-runtime', '--exclude', 'functions');
  const cleanOwned = () => {
    cli('stop', '--no-backup');
    if (createdVolume && existsVolume(volume)) docker('volume', 'rm', volume);
  };
  try {
    if (fs.existsSync(archive) && fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (
        !validateManifest(manifest, { key, image, checksum: checksum(archive) })
      ) {
        throw new Error('Baseline integrity or input mismatch');
      }
      docker('pull', image);
      const imageId = docker('image', 'inspect', image, '--format', '{{.Id}}');
      if (manifest.imageId !== imageId)
        throw new Error('Postgres image digest changed');
      docker('volume', 'create', volume);
      createdVolume = true;
      docker(
        'run',
        '--rm',
        '--network',
        'none',
        '--entrypoint',
        'sh',
        '-v',
        `${volume}:/baseline`,
        '-v',
        `${directory}:/cache:ro`,
        image,
        '-ec',
        'tar -xzf /cache/database.tar.gz -C /baseline'
      );
      start();
      verifyHistory(container);
      restored = true;
      console.log('Supabase baseline restored and migration history verified.');
    }
  } catch {
    console.warn(
      'Supabase baseline unavailable or invalid; rebuilding from migrations.'
    );
    if (createdVolume) cleanOwned();
  }
  if (!restored) {
    start();
    verifyHistory(container);
    // Stop PostgreSQL cleanly before copying its volume; never archive a live PGDATA.
    const inspect = JSON.parse(docker('inspect', container))[0];
    const mount = inspect.Mounts.find((entry) => entry.Name === volume);
    if (mount?.Destination !== '/var/lib/postgresql/data') {
      throw new Error('Unexpected Supabase database volume layout');
    }
    const imageId = inspect.Image;
    cli('stop');
    docker(
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'sh',
      '-v',
      `${volume}:/baseline:ro`,
      '-v',
      `${directory}:/cache`,
      imageId,
      '-ec',
      'tar -czf /cache/database.tar.gz -C /baseline . && chmod 644 /cache/database.tar.gz'
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        format: FORMAT,
        key,
        image,
        imageId,
        checksum: checksum(archive),
      })
    );
    start();
    verifyHistory(container);
    output('cache-ready', 'true');
  }
  // This fetches changing gateway model metadata; deliberately keep it outside the cache.
  run(process.execPath, [
    path.join(database, 'scripts/post-reset-ai-credits.js'),
  ]);
  output('restored', String(restored));
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, 'E2E_DOCKER_SUPABASE_RESET=0\n');
  }
}

if (require.main === module) {
  try {
    const current = identity();
    if (process.argv[2] === 'key') output('key', current.key);
    else if (process.argv[2] === 'prepare') prepare(current);
    else throw new Error('Usage: supabase-baseline.js key|prepare');
  } catch (error) {
    // Child-process output can contain local credentials. Do not dump it to CI logs.
    console.error(
      error.status === undefined
        ? error.message
        : 'Supabase baseline setup failed; run the isolated migration validation for diagnostics.'
    );
    process.exitCode = 1;
  }
}
