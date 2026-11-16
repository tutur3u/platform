import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { cliStore } from './cli-versions';
import {
  defaultGitGuardConfig,
  GIT_GUARD_VERSION,
  type GitGuardConfig,
  gitGuardHome,
  guardPaths,
  readGitGuardConfig,
  writeGitGuardConfig,
  writeJsonAtomic,
} from './git-guard-config';
import {
  type AgentConfigRecord,
  agentSettingsFiles,
  applyAgentDenyRules,
  removeAgentDenyRules,
} from './git-guard-agents';
import { appendGuardLog } from './git-guard-log';
import {
  DISPATCHED_HOOKS,
  dispatcherScript,
  ghShimScript,
  shellBlock,
  stripShellBlock,
  type TemplateContext,
} from './git-guard-templates';
import { stableResourceEntry } from './resources-setup';

export type GitRunner = (
  args: string[],
  cwd?: string
) => { code: number; stdout: string };

export const defaultGit: GitRunner = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: result.status ?? 1, stdout: (result.stdout ?? '').trim() };
};

export interface GuardManifest {
  version: number;
  installedAt: string;
  runtime: string;
  entry: string;
  /** Global core.hooksPath before install (restored on uninstall). */
  previousGlobal: string | null;
  /** Repos whose local core.hooksPath was repointed, with the old value. */
  repos: { path: string; previous: string }[];
  shellFiles: string[];
  /** Agent settings files given MCP pull-request deny rules (--agents). */
  agents?: AgentConfigRecord[];
}

/** Prefer a launcher path that survives `ttr upgrade` over a versioned one. */
export function stableGuardEntry(entry: string, store = cliStore()) {
  const stable = stableResourceEntry(entry);
  const prefix = `${join(store, 'versions')}/`;
  if (!stable.startsWith(prefix)) return stable;
  const rest = stable.slice(prefix.length).split('/');
  const candidate = join(store, 'current', ...rest.slice(1));
  try {
    if (
      existsSync(candidate) &&
      realpathSync(candidate) === realpathSync(stable)
    )
      return candidate;
  } catch {
    // Fall through to the exact entry.
  }
  return stable;
}

export const defaultEntry = () =>
  stableGuardEntry(
    join(__dirname, __filename.endsWith('.ts') ? 'index.ts' : 'index.js')
  );

export function shellFilesFor(shell: string, home = homedir()) {
  if (shell === 'none') return [];
  if (shell === 'zsh')
    return ['.zshenv', '.zprofile', '.zshrc'].map((file) =>
      join(process.env.ZDOTDIR || home, file)
    );
  if (shell === 'bash')
    return ['.bashrc', '.bash_profile', '.profile']
      .map((file) => join(home, file))
      .filter((path, index) => index === 0 || existsSync(path));
  throw new Error('Use --shell zsh, --shell bash, or --shell none.');
}

export const detectShell = (env = process.env) =>
  basename(env.SHELL || '') === 'bash' ? 'bash' : 'zsh';

async function writeExecutable(path: string, content: string) {
  const staged = `${path}.${process.pid}.tmp`;
  await writeFile(staged, content, { mode: 0o755 });
  await chmod(staged, 0o755);
  await rename(staged, path);
}

export async function readManifest(home = gitGuardHome()) {
  const text = await readFile(guardPaths(home).manifest, 'utf8').catch(
    () => null
  );
  return text ? (JSON.parse(text) as GuardManifest) : null;
}

function toplevel(git: GitRunner, path: string) {
  const result = git(['rev-parse', '--show-toplevel'], path);
  return result.code === 0 && result.stdout ? result.stdout : null;
}

export interface InstallOptions {
  home?: string;
  git?: GitRunner;
  repos?: string[];
  shell?: string;
  userHome?: string;
  runtime?: string;
  entry?: string;
  config?: Partial<GitGuardConfig>;
  /** Refresh only: keep config and repo list, rewrite templates. */
  refresh?: boolean;
  /** Add MCP pull-request deny rules to agent settings (opt-in). */
  agents?: boolean;
  agentFiles?: string[];
}

export async function installGitGuard(options: InstallOptions = {}) {
  const home = options.home ?? gitGuardHome();
  const git = options.git ?? defaultGit;
  const paths = guardPaths(home);
  const existingConfig = await readGitGuardConfig(home);
  const config: GitGuardConfig = {
    ...(existingConfig ?? defaultGitGuardConfig()),
    ...options.config,
    enabled: true,
  };
  const manifest = await readManifest(home);
  const runtime = options.runtime ?? process.execPath;
  const entry = options.entry ?? defaultEntry();

  const globalNow = git(['config', '--global', '--get', 'core.hooksPath']);
  const currentGlobal = globalNow.code === 0 ? globalNow.stdout : '';
  const previousGlobal =
    manifest?.previousGlobal ??
    (currentGlobal && resolve(currentGlobal) !== resolve(paths.hooks)
      ? currentGlobal
      : null);

  const context: TemplateContext = {
    runtime,
    entry,
    hooksDir: paths.hooks,
    previousGlobal: previousGlobal ?? undefined,
    repos: config.repos,
  };
  await mkdir(paths.hooks, { recursive: true, mode: 0o755 });
  await mkdir(paths.bin, { recursive: true, mode: 0o755 });
  for (const name of DISPATCHED_HOOKS)
    await writeExecutable(
      join(paths.hooks, name),
      dispatcherScript(context, name)
    );
  await writeExecutable(
    join(paths.bin, 'gh'),
    ghShimScript(context, paths.bin)
  );
  await writeGitGuardConfig(config, home);

  git(['config', '--global', 'core.hooksPath', paths.hooks]);
  git(['config', '--global', 'ttr-guard.hooksPath', paths.hooks]);

  const repoRecords = [...(manifest?.repos ?? [])];
  const requested = options.refresh
    ? []
    : (options.repos ?? []).map((repo) => resolve(repo));
  for (const path of requested) {
    const top = toplevel(git, path);
    if (!top) throw new Error(`Not a git repository: ${path}`);
    const local = git(['config', '--local', '--get', 'core.hooksPath'], top);
    const previous = local.code === 0 ? local.stdout : '';
    if (previous && resolve(top, previous) !== resolve(paths.hooks)) {
      git(['config', '--local', 'ttr-guard.chainHooksPath', previous], top);
      if (!repoRecords.some((record) => record.path === top))
        repoRecords.push({ path: top, previous });
    }
    git(['config', '--local', 'core.hooksPath', paths.hooks], top);
  }

  const shellFiles = options.refresh
    ? (manifest?.shellFiles ?? [])
    : shellFilesFor(options.shell ?? detectShell(), options.userHome);
  for (const file of shellFiles) {
    const original = await readFile(file, 'utf8').catch(() => '');
    const stripped = stripShellBlock(original);
    const next = `${stripped}${stripped && !stripped.endsWith('\n') ? '\n' : ''}${shellBlock(paths.bin)}`;
    if (next !== original) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, next);
    }
  }

  const nextManifest: GuardManifest = {
    version: GIT_GUARD_VERSION,
    installedAt: new Date().toISOString(),
    runtime,
    entry,
    previousGlobal,
    repos: repoRecords,
    shellFiles: [...new Set([...(manifest?.shellFiles ?? []), ...shellFiles])],
    agents:
      options.agents && !options.refresh
        ? await applyAgentDenyRules({
            files: options.agentFiles ?? agentSettingsFiles(options.userHome),
            backupDir: join(home, 'backups'),
            previous: manifest?.agents,
          })
        : (manifest?.agents ?? []),
  };
  await writeJsonAtomic(paths.manifest, nextManifest);
  await appendGuardLog(
    {
      event: 'install',
      machine: config.machine,
      reason: options.refresh ? 'refresh' : 'install',
    },
    home
  );
  return { config, manifest: nextManifest, paths };
}

/** Rewrite templates for the running CLI when the guard is installed. */
export async function refreshGitGuardIfEnabled(
  options: Omit<InstallOptions, 'refresh'> = {}
) {
  const home = options.home ?? gitGuardHome();
  const config = await readGitGuardConfig(home);
  if (!config?.enabled || !(await readManifest(home))) return null;
  return installGitGuard({ ...options, home, refresh: true });
}

export async function uninstallGitGuard(
  options: { home?: string; git?: GitRunner } = {}
) {
  const home = options.home ?? gitGuardHome();
  const git = options.git ?? defaultGit;
  const paths = guardPaths(home);
  const manifest = await readManifest(home);
  const config = await readGitGuardConfig(home);
  const globalNow = git(['config', '--global', '--get', 'core.hooksPath']);
  if (
    globalNow.code === 0 &&
    resolve(globalNow.stdout) === resolve(paths.hooks)
  ) {
    if (manifest?.previousGlobal)
      git(['config', '--global', 'core.hooksPath', manifest.previousGlobal]);
    else git(['config', '--global', '--unset', 'core.hooksPath']);
  }
  git(['config', '--global', '--unset', 'ttr-guard.hooksPath']);
  for (const record of manifest?.repos ?? []) {
    if (!existsSync(record.path)) continue;
    git(['config', '--local', 'core.hooksPath', record.previous], record.path);
    git(
      ['config', '--local', '--unset', 'ttr-guard.chainHooksPath'],
      record.path
    );
  }
  for (const file of manifest?.shellFiles ?? []) {
    const original = await readFile(file, 'utf8').catch(() => null);
    if (original === null) continue;
    const stripped = stripShellBlock(original);
    if (stripped !== original) await writeFile(file, stripped);
  }
  await removeAgentDenyRules(manifest?.agents ?? []);
  await rm(paths.hooks, { recursive: true, force: true });
  await rm(paths.bin, { recursive: true, force: true });
  await rm(paths.manifest, { force: true });
  if (config) await writeGitGuardConfig({ ...config, enabled: false }, home);
  await appendGuardLog({ event: 'uninstall', machine: config?.machine }, home);
}
