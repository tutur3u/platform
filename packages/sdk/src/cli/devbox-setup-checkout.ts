import { mkdir, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  DEFAULT_DEVBOX_CHECKOUT_DIRNAME,
  DEFAULT_DEVBOX_REPOSITORY_URL,
  getDefaultDevboxCheckoutPath,
  isTuturuuuPlatformRepositoryUrl,
} from '@tuturuuu/devbox';
import type { DevboxSetupCommandRunner } from './devbox-setup-command';

export type DevboxSetupConfirm = (question: string) => Promise<boolean>;

export interface DevboxCheckoutSelection {
  path: string;
  source: 'clone-into' | 'current' | 'default' | 'explicit';
}

export interface DevboxCheckoutOptions {
  cloneInto?: string;
  confirm?: DevboxSetupConfirm;
  cwd?: string;
  dir?: string;
  env?: Record<string, string | undefined>;
  json?: boolean;
  runCommand: DevboxSetupCommandRunner;
}

function expandHomePath(value: string) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return join(homedir(), value.slice(2));
  return value;
}

function resolveFromCwd(pathname: string, cwd: string) {
  return resolve(cwd, expandHomePath(pathname));
}

async function pathExists(pathname: string) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function isEmptyDirectory(pathname: string) {
  try {
    return (await readdir(pathname)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function canCloneDirectly(pathname: string) {
  return !(await pathExists(pathname)) || (await isEmptyDirectory(pathname));
}

async function getGitRoot({
  cwd,
  json,
  runCommand,
}: {
  cwd: string;
  json?: boolean;
  runCommand: DevboxSetupCommandRunner;
}) {
  const result = await runCommand(
    'git',
    ['-C', cwd, 'rev-parse', '--show-toplevel'],
    { capture: true, json }
  );

  if (result.code !== 0) return null;

  const root = result.stdout.trim();
  return root ? root : null;
}

async function isValidPlatformCheckout({
  checkoutDir,
  json,
  runCommand,
}: {
  checkoutDir: string;
  json?: boolean;
  runCommand: DevboxSetupCommandRunner;
}) {
  const result = await runCommand(
    'git',
    ['-C', checkoutDir, 'config', '--get', 'remote.origin.url'],
    { capture: true, json }
  );

  return (
    result.code === 0 && isTuturuuuPlatformRepositoryUrl(result.stdout.trim())
  );
}

export async function confirmDevboxSetupQuestion(question: string) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^(?:y|yes)$/iu.test(answer.trim());
  } finally {
    rl.close();
  }
}

export function canPromptDevboxSetup(options: {
  confirm?: DevboxSetupConfirm;
  env?: Record<string, string | undefined>;
  json?: boolean;
}) {
  if (options.json) return false;
  if (options.confirm) return true;
  if (options.env?.CI === 'true') return false;
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

async function askCloneInto({
  cloneDir,
  options,
  targetDir,
}: {
  cloneDir: string;
  options: DevboxCheckoutOptions;
  targetDir: string;
}) {
  if (!canPromptDevboxSetup(options)) return false;

  const confirm = options.confirm ?? confirmDevboxSetupQuestion;
  return confirm(
    `${targetDir} is not a Tuturuuu platform checkout. Clone and initialize ${DEFAULT_DEVBOX_REPOSITORY_URL} into ${cloneDir}?`
  );
}

function explicitInvalidTargetError(targetDir: string) {
  const cloneDir = join(targetDir, DEFAULT_DEVBOX_CHECKOUT_DIRNAME);

  return [
    `${targetDir} is not a Tuturuuu platform checkout.`,
    `Use --clone-into ${cloneDir} to clone ${DEFAULT_DEVBOX_REPOSITORY_URL} without modifying the requested directory.`,
  ].join(' ');
}

export async function resolveDevboxCheckout(
  options: DevboxCheckoutOptions
): Promise<DevboxCheckoutSelection> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const explicitDir = options.dir?.trim();
  const cloneInto = options.cloneInto?.trim();

  if (cloneInto) {
    return {
      path: resolveFromCwd(cloneInto, cwd),
      source: 'clone-into',
    };
  }

  if (explicitDir) {
    const targetDir = resolveFromCwd(explicitDir, cwd);

    if (
      (await canCloneDirectly(targetDir)) ||
      (await isValidPlatformCheckout({
        checkoutDir: targetDir,
        json: options.json,
        runCommand: options.runCommand,
      }))
    ) {
      return { path: targetDir, source: 'explicit' };
    }

    const cloneDir = join(targetDir, DEFAULT_DEVBOX_CHECKOUT_DIRNAME);
    if (await askCloneInto({ cloneDir, options, targetDir })) {
      return { path: cloneDir, source: 'clone-into' };
    }

    throw new Error(explicitInvalidTargetError(targetDir));
  }

  const gitRoot = await getGitRoot({
    cwd,
    json: options.json,
    runCommand: options.runCommand,
  });

  if (
    gitRoot &&
    (await isValidPlatformCheckout({
      checkoutDir: gitRoot,
      json: options.json,
      runCommand: options.runCommand,
    }))
  ) {
    return { path: gitRoot, source: 'current' };
  }

  const cloneDir = join(cwd, DEFAULT_DEVBOX_CHECKOUT_DIRNAME);
  if (await askCloneInto({ cloneDir, options, targetDir: cwd })) {
    return { path: cloneDir, source: 'clone-into' };
  }

  return {
    path: resolve(expandHomePath(getDefaultDevboxCheckoutPath())),
    source: 'default',
  };
}

export async function ensurePlatformCheckout({
  checkoutDir,
  json,
  runCommand,
}: {
  checkoutDir: string;
  json?: boolean;
  runCommand: DevboxSetupCommandRunner;
}) {
  if (await canCloneDirectly(checkoutDir)) {
    await mkdir(dirname(checkoutDir), { recursive: true });
    const result = await runCommand(
      'git',
      ['clone', DEFAULT_DEVBOX_REPOSITORY_URL, checkoutDir],
      { json }
    );

    if (result.code !== 0) {
      throw new Error(
        `Clone Tuturuuu platform failed with exit code ${result.code}: git clone ${DEFAULT_DEVBOX_REPOSITORY_URL} ${checkoutDir}`
      );
    }

    return 'cloned' as const;
  }

  if (
    !(await isValidPlatformCheckout({
      checkoutDir,
      json,
      runCommand,
    }))
  ) {
    throw new Error(
      `Refusing to use ${checkoutDir}. It must be empty, missing, or a clone of ${DEFAULT_DEVBOX_REPOSITORY_URL}.`
    );
  }

  return 'reused' as const;
}
