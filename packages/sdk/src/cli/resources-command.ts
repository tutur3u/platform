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

const heavyTask = /^(test|build|check|check-types|type-check|lint|tc)(:.*)?$/;
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
    for (let i = 0; i < tail.length; i++) {
      const arg = tail[i]!;
      if (['--cwd', '--filter', '-F', '--env-file'].includes(arg)) {
        i++;
        continue;
      }
      if (arg.startsWith('-') || ['run', 'x', 'exec'].includes(arg)) continue;
      return (
        heavyTask.test(arg) ||
        ['sb:start', 'sb:reset', 'sb:up'].includes(arg) ||
        scripts.includes(basename(arg))
      );
    }
  }
  return false;
}

// Version/help probes skip the queue only for tools whose single flag is known
// to be informational; for anything else (a Makefile target, a project script)
// `help` or `--version` may run arbitrary work.
const versionHelp = ['--version', '-v', '--help', '-h'];
const informational: Record<string, readonly string[]> = {
  node: versionHelp,
  bun: versionHelp,
  bunx: versionHelp,
  deno: [...versionHelp, '-V'],
  npm: versionHelp,
  npx: versionHelp,
  pnpm: versionHelp,
  yarn: versionHelp,
  tsc: versionHelp,
  vitest: versionHelp,
  biome: ['--version', '--help', '-h'],
  turbo: ['--version', '--help', '-h'],
  git: ['--version', '--help', '-h', 'version'],
  gh: ['--version', '--help', '-h', 'version'],
  ttr: ['--version', '--help', '-h', 'version'],
  cargo: ['--version', '-V', '--help', '-h'],
  rustc: ['--version', '-V', '--help', '-h'],
  rustup: ['--version', '-V', '--help', '-h'],
  python: ['--version', '-V', '--help', '-h'],
  python3: ['--version', '-V', '--help', '-h'],
  go: ['version', 'help'],
  docker: ['--version', '-v', '--help', 'version'],
  flutter: ['--version', '--help', '-h'],
  dart: ['--version', '--help', '-h'],
  supabase: ['--version', '--help', '-h'],
};
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
// diff/log/show are excluded: textconv and external diff drivers configured by
// the repository can run arbitrary programs.
const readOnlyGit = new Set([
  'status',
  'rev-parse',
  'branch',
  'remote',
  'ls-files',
]);
// Options that redirect git's configuration, repository or helpers, letting a
// "read-only" subcommand run hooks, pagers or drivers from elsewhere.
const unsafeGitOption = (arg: string) =>
  /^-[Cc]/u.test(arg) ||
  /^--(exec|config-env|git-dir|work-tree|paginate|namespace)/u.test(arg) ||
  arg === '-p' ||
  arg === '--edit-description';
// `git remote` subcommands other than listing/get-url contact or edit remotes.
const readOnlyRemote = (rest: string[]) =>
  rest[0] === 'get-url' ||
  rest.every((arg) => arg === '-v' || arg === '--verbose');
const recursiveLs = (arg: string) =>
  arg === '--recursive' || /^-[A-Za-z]*R/u.test(arg);
// Explicit `ttr resources run` queues by default because arbitrary scripts can
// be heavy. Per-tool version/help probes and a small read-only allowlist skip
// the queue. Anything unrecognised queues (fail closed).
export function isTrivialCommand(name: string, args: string[]) {
  const tool = basename(name);
  if (args.length === 1 && informational[tool]?.includes(args[0]!)) return true;
  if (tool === 'ls') return !args.some(recursiveLs);
  if (readOnly.has(tool)) return true;
  if (tool === 'git') {
    // The subcommand must come first: no global options may precede it.
    const [subcommand, ...rest] = args;
    return (
      subcommand !== undefined &&
      readOnlyGit.has(subcommand) &&
      !rest.some(unsafeGitOption) &&
      (subcommand !== 'remote' || readOnlyRemote(rest))
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
