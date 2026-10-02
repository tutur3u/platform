import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function execute(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Required runtime command failed: ${command}`);
  }
  return result.stdout.trim();
}

export function resolveVersion(workspace, requested = '') {
  const stable = /^\d+\.\d+\.\d+$/;
  if (requested) {
    if (!stable.test(requested))
      throw new Error('CLI override must be an exact stable version');
    return requested;
  }
  const lock = JSON.parse(
    readFileSync(path.join(workspace, 'bun.lock'), 'utf8').replace(
      /,\s*([}\]])/g,
      '$1'
    )
  );
  const root = lock.workspaces?.['apps/database'];
  if (!root?.dependencies?.supabase && !root?.devDependencies?.supabase) {
    throw new Error(
      'Root lock must declare the database workspace Supabase CLI'
    );
  }
  const resolution = lock.packages?.supabase?.[0];
  const version =
    typeof resolution === 'string' ? resolution.replace(/^supabase@/, '') : '';
  if (!stable.test(version))
    throw new Error('Root lock must resolve an exact stable Supabase CLI');
  return version;
}

export function prepare(env = process.env) {
  const version = resolveVersion(env.GITHUB_WORKSPACE, env.REQUESTED_VERSION);
  if (
    Number(execute('node', ['-p', 'process.versions.node']).split('.')[0]) < 20
  ) {
    throw new Error('Configure Node 20+ before Supabase CLI setup');
  }
  execute('npm', ['--version']);
  const lookup = spawnSync('/bin/bash', ['-c', 'command -v bun'], {
    encoding: 'utf8',
  });
  const bun = lookup.status === 0 ? lookup.stdout.trim() : '';
  const bunVersion = bun ? execute(bun, ['--version']) : '';
  const home = path.join(env.RUNNER_TEMP, 'supabase-cli-home');
  mkdirSync(home, { recursive: true });
  const outputs = {
    version,
    'installer-home': home,
    'repo-bun': bun,
    'repo-bun-version': bunVersion,
  };
  for (const [key, value] of Object.entries(outputs)) {
    if (/[\r\n]/.test(value))
      throw new Error('Invalid multiline runtime output');
    appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  return outputs;
}

export function restore(env = process.env) {
  if (!env.REPO_BUN && !env.REPO_BUN_VERSION) return;
  if (!path.isAbsolute(env.REPO_BUN || ''))
    throw new Error('Missing original Bun path');
  if (execute(env.REPO_BUN, ['--version']) !== env.REPO_BUN_VERSION) {
    throw new Error('Repository Bun changed during Supabase CLI setup');
  }
  appendFileSync(env.GITHUB_PATH, `${path.dirname(env.REPO_BUN)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv[2] === 'prepare') prepare();
    else if (process.argv[2] === 'restore') restore();
    else throw new Error('Expected prepare or restore');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
