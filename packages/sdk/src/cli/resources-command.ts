import {
  accessSync,
  closeSync,
  constants,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { basename, delimiter, join, resolve } from 'node:path';
import type { ResourceConfig } from './resources-config';

const heavyTask =
  /^(test|build|validate|check|check-types|type-check|lint|tc)(:.*)?$/;
const tools = [
  'turbo',
  'vitest',
  'playwright',
  'next',
  'eslint',
  'tsc',
  'supabase',
];
export const resourceShims = ['bun', 'bunx', 'node', 'npx', ...tools, 'cargo'];

export function commandCwd(args: string[], cwd = process.cwd()) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (['--cwd', '--dir', '-C'].includes(arg) && args[i + 1])
      return resolve(cwd, args[i + 1]!);
    if (arg.startsWith('--cwd=')) return resolve(cwd, arg.slice(6));
    if (arg === '--') break;
  }
  return cwd;
}

export function commandTool(name: string, args: string[]) {
  if (name === 'bun' && basename(args[0] || '') === 'ttr.cjs')
    return { tool: 'ttr', tail: args.slice(1), offset: 1 };

  if (['node', 'bun', 'bunx', 'npx'].includes(name)) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (
        ['-e', '-p', '--eval', '--print'].some(
          (flag) => arg === flag || arg.startsWith(`${flag}=`)
        )
      )
        break;
      const file = basename(arg);
      for (const tool of tools) {
        if (
          [tool, `${tool}.js`, `${tool}.mjs`].includes(file) ||
          (arg.includes(`/${tool}/`) &&
            ['cli.js', 'index.js', 'vitest.mjs'].includes(file))
        ) {
          const offset =
            i + 1 + (name === 'bun' && args[i + 1] === '--' ? 1 : 0);
          return { tool, tail: args.slice(offset), offset };
        }
      }
    }
  }
  return { tool: name, tail: args, offset: 0 };
}

function bunTaskIndex(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (['--cwd', '--filter', '-F', '--env-file'].includes(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith('-') || ['run', 'x', 'exec'].includes(arg)) continue;
    return i;
  }
  return -1;
}

export function isHeavyCommand(name: string, args: string[]) {
  const { tool, tail } = commandTool(basename(name), args);
  const flags = tail.includes('--') ? tail.slice(0, tail.indexOf('--')) : tail;
  if (
    flags.some(
      (x) =>
        ['--help', '-h', '--version', '-v', '--dry', '--dry-run'].includes(x) ||
        x.startsWith('--dry=')
    )
  )
    return false;
  if (tool === 'turbo') return tail.some((x) => heavyTask.test(x));
  if (['vitest', 'eslint', 'tsc'].includes(tool)) return true;
  if (tool === 'playwright')
    return tail.includes('test') && !tail.includes('--list');
  if (tool === 'next') return tail.includes('build');
  if (tool === 'supabase')
    return (
      ['start', 'test'].includes(tail[0] || '') ||
      (tail[0] === 'db' && tail[1] === 'reset')
    );
  if (tool === 'cargo')
    return ['build', 'check', 'test', 'clippy'].includes(tail[0] || '');
  const scripts = [
    'check.js',
    'cloudflare-build.mjs',
    'run-script-tests.js',
    'run-web-e2e-docker.js',
  ];
  if (tool === 'node')
    return tail.some((arg) => scripts.includes(basename(arg)));
  if (tool === 'bun') {
    const arg = tail[bunTaskIndex(tail)];
    return (
      !!arg &&
      (heavyTask.test(arg) ||
        ['sb:start', 'sb:reset', 'sb:up'].includes(arg) ||
        scripts.includes(basename(arg)))
    );
  }
  return false;
}

const informational = new Set([
  '--version',
  '-v',
  '-V',
  'version',
  '--help',
  '-h',
  'help',
]);
const readOnly = new Set([
  'echo',
  'pwd',
  'true',
  'false',
  'which',
  'whoami',
  'uname',
  'date',
  'printenv',
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
]);
const readOnlyGit = new Set([
  'status',
  'rev-parse',
  'log',
  'diff',
  'show',
  'branch',
  'remote',
  'ls-files',
]);
// Explicit `ttr resources run` queues by default because arbitrary scripts can
// be heavy. Version/help probes and a small read-only allowlist skip the queue.
export function isTrivialCommand(name: string, args: string[]) {
  const tool = basename(name);
  const flags = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;
  if (flags.length === 1 && informational.has(flags[0]!)) return true;
  if (readOnly.has(tool)) return true;
  if (tool === 'git') {
    const subcommand = args.find((arg) => !arg.startsWith('-'));
    return (
      subcommand !== undefined &&
      readOnlyGit.has(subcommand) &&
      !args.some((arg) => arg === '-C' || arg.startsWith('--exec'))
    );
  }
  return false;
}

export function limitCommand(
  name: string,
  args: string[],
  config: ResourceConfig
) {
  const { tool, tail, offset } = commandTool(basename(name), args);
  if (!isHeavyCommand(name, args)) return args;
  if (tool === 'vitest' || tool === 'cargo') {
    const budget = tool === 'vitest' ? config.vitestWorkers : config.buildJobs;
    const flags =
      tool === 'vitest'
        ? ['--maxWorkers', '--max-workers', '--minWorkers', '--min-workers']
        : ['-j', '--jobs'];
    const limited: string[] = [];
    for (let i = 0; i < tail.length; i++) {
      const arg = tail[i]!;
      if (arg === '--') {
        limited.push(...tail.slice(i));
        break;
      }
      if (flags.includes(arg)) {
        i++;
        continue;
      }
      if (
        flags.some((flag) => arg.startsWith(`${flag}=`)) ||
        (tool === 'cargo' && /^-j\d/.test(arg))
      )
        continue;
      limited.push(arg);
    }
    const divider = limited.indexOf('--');
    const cap =
      tool === 'vitest' ? `--maxWorkers=${budget}` : `--jobs=${budget}`;
    limited.splice(divider < 0 ? limited.length : divider, 0, cap);
    return [...args.slice(0, offset), ...limited];
  }
  if (tool === 'bun' && tail[bunTaskIndex(tail)] === 'check') {
    let budget = config.buildJobs;
    const limited: string[] = [];
    for (let i = 0; i < tail.length; i++) {
      const arg = tail[i]!;
      if (arg === '--') {
        limited.push(...tail.slice(i));
        break;
      }
      if (arg === '--threads' || arg.startsWith('--threads=')) {
        const value =
          arg === '--threads' ? tail[++i] : arg.slice('--threads='.length);
        const requested = Number(value);
        if (!Number.isSafeInteger(requested) || requested < 1)
          throw new Error('bun check --threads requires a positive integer.');
        budget = Math.min(budget, requested);
        continue;
      }
      limited.push(arg);
    }
    const divider = limited.indexOf('--');
    limited.splice(
      divider < 0 ? limited.length : divider,
      0,
      `--threads=${budget}`
    );
    return [...args.slice(0, offset), ...limited];
  }
  if (tool !== 'turbo') return args;
  const divider = tail.indexOf('--');
  const before = divider < 0 ? tail : tail.slice(0, divider);
  const after = divider < 0 ? [] : tail.slice(divider);
  const limited: string[] = [];
  for (let i = 0; i < before.length; i++) {
    const arg = before[i]!;
    if (arg === '--concurrency') {
      i++;
      continue;
    }
    if (arg.startsWith('--concurrency=') || arg === '--parallel') continue;
    limited.push(arg);
  }
  return [
    ...args.slice(0, offset),
    ...limited,
    `--concurrency=${config.turboConcurrency}`,
    ...after,
  ];
}

function isManagedShim(path: string) {
  const descriptor = openSync(path, 'r');
  try {
    const prefix = Buffer.alloc(128);
    readSync(descriptor, prefix, 0, prefix.length, 0);
    return prefix.toString('utf8').includes('# Managed by ttr resources');
  } finally {
    closeSync(descriptor);
  }
}

export function realExecutable(
  name: string,
  shimDir: string,
  path = process.env.PATH || ''
) {
  if (name.includes('/') || name.includes('\\')) return resolve(name);
  for (const directory of path.split(delimiter)) {
    if (resolve(directory) === resolve(shimDir)) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (realpathSync(candidate).startsWith(`${resolve(shimDir)}/`)) continue;
      if (isManagedShim(candidate)) continue;
      return candidate;
    } catch {
      /* Try the next PATH entry. */
    }
  }
  throw new Error(`Cannot find ${name} outside the resource-control shims.`);
}
