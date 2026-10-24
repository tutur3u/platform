import {
  accessSync,
  closeSync,
  constants,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
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

// Flags that consume the next argument, so it is not mistaken for the program.
const valueFlags: Record<string, readonly string[]> = {
  node: [
    '-r',
    '--require',
    '--import',
    '--loader',
    '--experimental-loader',
    '-C',
    '--conditions',
    '--input-type',
    '--env-file',
    '--title',
    '--allow-fs-read',
    '--allow-fs-write',
    '--build-sea',
    '--build-snapshot-config',
    '--cpu-prof-dir',
    '--cpu-prof-interval',
    '--cpu-prof-name',
    '--diagnostic-dir',
    '--disable-proto',
    '--disable-warning',
    '--dns-result-order',
    '--env-file-if-exists',
    '--experimental-default-type',
    '--experimental-package-map',
    '--experimental-sea-config',
    '--experimental-test-tag-filter',
    '--heap-prof-dir',
    '--heap-prof-interval',
    '--heap-prof-name',
    '--heapsnapshot-near-heap-limit',
    '--heapsnapshot-signal',
    '--icu-data-dir',
    '--debug-port',
    '--inspect-port',
    '--inspect-publish-uid',
    '--localstorage-file',
    '--max-http-header-size',
    '--max-old-space-size',
    '--max-old-space-size-percentage',
    '--max-semi-space-size',
    '--stack-size',
    '--network-family-autoselection-attempt-timeout',
    '--openssl-config',
    '--redirect-warnings',
    '--report-directory',
    '--report-dir',
    '--report-filename',
    '--report-signal',
    '--run',
    '--secure-heap',
    '--secure-heap-min',
    '--snapshot-blob',
    '--test-concurrency',
    '--test-coverage-branches',
    '--test-coverage-exclude',
    '--test-coverage-functions',
    '--test-coverage-include',
    '--test-coverage-lines',
    '--test-global-setup',
    '--experimental-test-isolation',
    '--test-isolation',
    '--test-name-pattern',
    '--test-random-seed',
    '--test-reporter',
    '--test-reporter-destination',
    '--test-rerun-failures',
    '--test-shard',
    '--test-skip-pattern',
    '--test-timeout',
    '--tls-cipher-list',
    '--tls-keylog',
    '--trace-event-categories',
    '--trace-event-file-pattern',
    '--trace-require-module',
    '--unhandled-rejections',
    '--use-largepages',
    '--v8-pool-size',
    '--watch-kill-signal',
    '--watch-path',
  ],
  bun: [
    '--cwd',
    '-F',
    '--filter',
    '--env-file',
    '-r',
    '--preload',
    '--config',
    '-c',
    '--tsconfig-override',
    '-d',
    '--define',
  ],
  bunx: ['-p', '--package'],
  npx: ['-p', '--package', '-c', '--call'],
};
// Bare forms do not consume the following argv in Node 26.4.
export const nodeConfigFlags = new Set([
  '--experimental-config-file',
  '--experimental-default-config-file',
]);
const nodeEqualsOnlyFlags = new Set(['--experimental-specifier-resolution']);
// Only known switches can be skipped without risking a value becoming the program.
const nodeSwitches = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '--no-warnings',
  '--enable-source-maps',
  '--experimental-strip-types',
  '--experimental-transform-types',
  '--experimental-vm-modules',
  '--expose-gc',
  '--inspect',
  '--inspect-brk',
  '--inspect-wait',
  '--no-deprecation',
  '--trace-deprecation',
  '--trace-warnings',
  '--no-experimental-fetch',
]);
// The ttr CLI (`#!/usr/bin/env bun`) starts through the bun shim whenever the
// shims are on PATH. It does its own admission, so a shim must never admit it.
const ttrLaunchers = new Set([
  'ttr',
  'ttr.cjs',
  'tuturuuu',
  'tutur3u',
  'resources-entry.ts',
  'resources-entry.js',
]);
export function commandTool(name: string, args: string[]) {
  if (name === 'bun' && basename(args[0] || '') === 'ttr.cjs')
    return { tool: 'ttr', tail: args.slice(1), offset: 1 };

  if (['node', 'bun', 'bunx', 'npx'].includes(name)) {
    let optionsEnded = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (
        !optionsEnded &&
        ['-e', '-p', '--eval', '--print'].some(
          (flag) => arg === flag || arg.startsWith(`${flag}=`)
        ) &&
        (name === 'node' || name === 'bun')
      )
        break;
      if (!optionsEnded && arg.startsWith('-')) {
        if (arg === '--') {
          optionsEnded = true;
          continue;
        }
        const flag = arg.split('=')[0]!;
        if (name === 'node' && (flag === '--run' || nodeConfigFlags.has(flag)))
          return { tool: 'ambiguous', tail: args, offset: 0 };
        if (name === 'node' && nodeEqualsOnlyFlags.has(flag)) {
          if (!arg.includes('='))
            return { tool: 'ambiguous', tail: args, offset: 0 };
          continue;
        }
        if (valueFlags[name]?.includes(flag)) {
          if (!arg.includes('=')) {
            const value = args[i + 1];
            if (
              !value ||
              value.startsWith('-') ||
              commandTool(name, [value]).tool !== name ||
              isHeavyCommand(name, [value])
            )
              return { tool: 'ambiguous', tail: args, offset: 0 };
            i++;
          }
        } else if (
          name === 'node' &&
          !nodeSwitches.has(flag) &&
          !/^-[rC].+/u.test(arg)
        )
          return { tool: 'ambiguous', tail: args, offset: 0 };
        continue;
      }
      if (name === 'bun' && ['run', 'x', 'exec'].includes(arg)) continue;
      // The first positional is the program; everything after it is that
      // program's own argv (`bun /path/ttr resources run -- bunx vitest` runs
      // ttr, not vitest).
      const file = basename(arg);
      if (ttrLaunchers.has(file))
        return { tool: 'ttr', tail: args.slice(i + 1), offset: i + 1 };
      for (const tool of tools) {
        if (
          [tool, `${tool}.js`, `${tool}.mjs`].includes(file) ||
          (tool === 'playwright' &&
            arg.includes('/@playwright/test/') &&
            file === 'cli.js') ||
          (arg.includes(`/${tool}/`) &&
            ['cli.js', 'index.js', 'vitest.mjs'].includes(file))
        ) {
          const offset =
            i + 1 + (name === 'bun' && args[i + 1] === '--' ? 1 : 0);
          return { tool, tail: args.slice(offset), offset };
        }
      }
      break;
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
  if (tool === 'ambiguous') return true;
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

// Explicit `ttr resources run` queues by default because arbitrary scripts can
// be heavy. Only a few coreutils that never run project code skip the queue.
// Runtimes and package managers are excluded even for `--version`/`--help`
// (NODE_OPTIONS, npm_config_* and preload settings load code before any flag
// is read), and so is every git subcommand: fsmonitor, hooks, pagers, textconv
// and GIT_CONFIG_* injection all run programs from read-only-looking commands.
// `ls` is excluded: recursive listings hide behind bundled short flags (`-1R`)
// and GNU long-option abbreviations (`--rec`).
const readOnly = new Set([
  'echo',
  'pwd',
  'true',
  'false',
  'whoami',
  'uname',
  'date',
  'printenv',
  'cat',
  'head',
  'tail',
  'wc',
]);
// Canonical directories of system coreutils, matched exactly (no nested
// subdirectories): SIP (macOS) or root ownership (Linux) protects them.
// Ubuntu 25.10+ links /usr/bin/cat and friends to rust-coreutils under
// /usr/lib/cargo/bin/coreutils.
const trustedDirectories = new Set([
  '/bin',
  '/usr/bin',
  '/usr/lib/cargo/bin/coreutils',
]);
// Dynamic-loader and glibc module variables run code inside any binary.
const loaderVariable = /^(LD_|DYLD_)|^(GCONV_PATH|LOCPATH)$/u;
// Filesystem lookups, injectable so Linux and macOS layouts are testable on
// either host.
export interface ExecutableFs {
  executable: (path: string) => boolean;
  realpath: (path: string) => string;
  stat: (path: string) => { uid: number; mode: number; isFile: () => boolean };
}
const hostFs: ExecutableFs = {
  executable: (path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  realpath: (path) => realpathSync(path),
  stat: (path) => statSync(path),
};
// Classify by the executable that would actually run, not by its basename: an
// arbitrary script named `cat` (or `/any/path/node`) must queue. Returns the
// canonical path, and callers must spawn exactly that path: the original name
// or symlink can be swapped between classification and spawn. The canonical
// basename must equal the tool name, so a multicall binary (rust-coreutils)
// still sees the intended applet in argv[0] and a differently named one
// (busybox) queues.
export function trustedSystemExecutable(
  name: string,
  path = process.env.PATH || '',
  fs: ExecutableFs = hostFs
) {
  const candidates =
    name.includes('/') || name.includes('\\')
      ? [resolve(name)]
      : path.split(delimiter).map((directory) => join(directory, name));
  for (const candidate of candidates) {
    if (!fs.executable(candidate)) continue;
    // The first executable match is what PATH lookup would spawn; decide on
    // it alone rather than searching on for a trusted one.
    try {
      const real = fs.realpath(candidate);
      if (
        !trustedDirectories.has(dirname(real)) ||
        basename(real) !== basename(name) ||
        !fs.stat(real).isFile()
      )
        return undefined;
      // Root-owned and not group/other writable on every component, so no
      // other user can replace the file or any directory above it.
      for (let part = real; ; part = dirname(part)) {
        const info = fs.stat(part);
        if (info.uid !== 0 || (info.mode & 0o022) !== 0) return undefined;
        if (part === dirname(part)) break;
      }
      return real;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
// The canonical executable to spawn without admission, or undefined to queue.
export function trivialExecutable(
  name: string,
  env: NodeJS.ProcessEnv = process.env
) {
  if (!readOnly.has(basename(name))) return undefined;
  if (Object.keys(env).some((key) => loaderVariable.test(key)))
    return undefined;
  return trustedSystemExecutable(name, env.PATH || '');
}
export function isTrivialCommand(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env
) {
  void args;
  return trivialExecutable(name, env) !== undefined;
}

function nodeTestOptions(args: string[]) {
  let testing = false;
  let workers: number | undefined;
  let end = 0;
  for (; end < args.length; end++) {
    const arg = args[end]!;
    if (arg === '--' || !arg.startsWith('-')) break;
    const flag = arg.split('=')[0]!.replaceAll('_', '-');
    if (['-e', '-p', '--eval', '--print'].includes(flag)) return undefined;
    if (flag === '--test' || nodeConfigFlags.has(flag)) testing = true;
    if (flag === '--test-concurrency') {
      const requested = Number(
        arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[end + 1]
      );
      workers =
        Number.isInteger(requested) && requested > 0 ? requested : undefined;
    }
    if (valueFlags.node?.includes(flag) && !arg.includes('=')) end++;
  }
  return testing ? { end, workers } : undefined;
}

export function nodeTestWorkers(args: string[], cap: number) {
  const options = nodeTestOptions(args);
  return options ? Math.min(options.workers ?? cap, cap) : undefined;
}

function limitNodeTests(args: string[], tokens: number) {
  const parsed = nodeTestOptions(args);
  if (!parsed) return undefined;
  const { end } = parsed;
  const workers = Math.min(parsed.workers ?? tokens, tokens);
  const options: string[] = [];
  for (let i = 0; i < end; i++) {
    const arg = args[i]!;
    const flag = arg.split('=')[0]!.replaceAll('_', '-');
    if (flag === '--test-concurrency') {
      if (!arg.includes('=')) i++;
    } else {
      options.push(arg);
      // Preserve option values verbatim, including strings that look like flags.
      if (valueFlags.node?.includes(flag) && !arg.includes('=')) {
        if (args[i + 1] !== undefined) options.push(args[i + 1]!);
        i++;
      }
    }
  }
  return [`--test-concurrency=${workers}`, ...options, ...args.slice(end)];
}

export function limitCommand(
  name: string,
  args: string[],
  config: ResourceConfig
) {
  const { tool, tail, offset } = commandTool(basename(name), args);
  if (!isHeavyCommand(name, args)) return args;
  if (basename(name) === 'node') {
    const tests = limitNodeTests(args, config.vitestWorkers);
    if (tests) return tests;
  }
  if (tool === 'vitest' || tool === 'cargo' || tool === 'playwright') {
    const budget = tool === 'cargo' ? config.buildJobs : config.vitestWorkers;
    const flags =
      tool === 'vitest'
        ? ['--maxWorkers', '--max-workers', '--minWorkers', '--min-workers']
        : tool === 'playwright'
          ? ['-j', '--workers']
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
        ((tool === 'cargo' || tool === 'playwright') && /^-j\d/.test(arg))
      )
        continue;
      limited.push(arg);
    }
    const divider = limited.indexOf('--');
    const cap =
      tool === 'vitest'
        ? `--maxWorkers=${budget}`
        : tool === 'playwright'
          ? `--workers=${budget}`
          : `--jobs=${budget}`;
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
