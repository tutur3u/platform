import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import {
  GIT_GUARD_VERSION,
  gitGuardHome,
  guardPaths,
  readGitGuardConfig,
} from './git-guard-config';
import { defaultGit, type GitRunner, readManifest } from './git-guard-install';
import { agentDenyStatus } from './git-guard-agents';
import { listOverrides, readGuardLog } from './git-guard-log';
import { DISPATCHED_HOOKS, MANAGED_MARKER } from './git-guard-templates';

export interface RepoGuardState {
  path: string;
  effectiveHooksPath: string;
  guarded: boolean;
  chain?: string;
  /** Hooks in the chained directory the dispatcher will not run. */
  undispatched: string[];
}

function hookVersion(path: string) {
  try {
    const match = /Managed by ttr git guard v(\d+)/u.exec(
      readFileSync(path, 'utf8')
    );
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export function firstOnPath(name: string, pathValue = process.env.PATH ?? '') {
  for (const dir of pathValue.split(delimiter)) {
    if (dir && existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

export function repoGuardState(
  path: string,
  hooksDir: string,
  git: GitRunner = defaultGit
): RepoGuardState | null {
  const top = git(['rev-parse', '--show-toplevel'], path);
  if (top.code !== 0) return null;
  const configured = git(['config', '--get', 'core.hooksPath'], top.stdout);
  const value = configured.code === 0 ? configured.stdout : '';
  const effective = value
    ? resolve(top.stdout, value)
    : join(top.stdout, '.git', 'hooks');
  const chain = git(
    ['config', '--get', 'ttr-guard.chainHooksPath'],
    top.stdout
  );
  const chainDir =
    chain.code === 0 && chain.stdout
      ? resolve(top.stdout, chain.stdout)
      : undefined;
  let undispatched: string[] = [];
  if (chainDir && existsSync(chainDir)) {
    undispatched = readdirSync(chainDir).filter(
      (name) =>
        !name.endsWith('.sample') &&
        !(DISPATCHED_HOOKS as readonly string[]).includes(name)
    );
  }
  return {
    path: top.stdout,
    effectiveHooksPath: effective,
    guarded: resolve(effective) === resolve(hooksDir),
    chain: chainDir,
    undispatched,
  };
}

export async function gitGuardStatus(
  options: {
    home?: string;
    git?: GitRunner;
    repos?: string[];
    pathValue?: string;
    logLimit?: number;
  } = {}
) {
  const home = options.home ?? gitGuardHome();
  const git = options.git ?? defaultGit;
  const paths = guardPaths(home);
  const config = await readGitGuardConfig(home);
  const manifest = await readManifest(home);
  const prePush = join(paths.hooks, 'pre-push');
  const installedVersion = hookVersion(prePush);
  const shim = join(paths.bin, 'gh');
  const ghFirst = firstOnPath('gh', options.pathValue);
  const globalHooks = git(['config', '--global', '--get', 'core.hooksPath']);
  const repoPaths = [
    ...new Set([
      ...(options.repos ?? [process.cwd()]),
      ...(manifest?.repos.map((repo) => repo.path) ?? []),
    ]),
  ];
  const repos = repoPaths
    .map((path) => repoGuardState(path, paths.hooks, git))
    .filter((state): state is RepoGuardState => state !== null);
  const now = Date.now();
  const log = await readGuardLog(home, options.logLimit ?? 200);
  return {
    home,
    enabled: config?.enabled === true,
    machine: config?.machine ?? null,
    config,
    hook: {
      installed: installedVersion !== null,
      version: installedVersion,
      current: installedVersion === GIT_GUARD_VERSION,
      globalHooksPath: globalHooks.code === 0 ? globalHooks.stdout : null,
      globalActive:
        globalHooks.code === 0 &&
        resolve(globalHooks.stdout) === resolve(paths.hooks),
      launcher: manifest
        ? {
            runtime: manifest.runtime,
            entry: manifest.entry,
            present: existsSync(manifest.runtime) && existsSync(manifest.entry),
          }
        : null,
    },
    gh: {
      shimInstalled: existsSync(shim) && hookVersion(shim) !== null,
      firstOnPath: ghFirst,
      active:
        ghFirst !== null &&
        resolve(ghFirst) === resolve(shim) &&
        readFileSync(ghFirst, 'utf8').includes(MANAGED_MARKER),
    },
    repos,
    agents: await agentDenyStatus(
      (manifest?.agents ?? []).map((record) => record.path)
    ),
    pendingOverrides: (await listOverrides(home)).filter(
      (override) => Date.parse(override.expiresAt) > now
    ),
    lastRefusals: log.filter((entry) => entry.event === 'refused').slice(-10),
    lastOverrides: log
      .filter((entry) => entry.event === 'override-consumed')
      .slice(-5),
  };
}

export type GitGuardStatus = Awaited<ReturnType<typeof gitGuardStatus>>;

export function renderGitGuardStatus(status: GitGuardStatus) {
  const yes = (value: boolean) => (value ? 'yes' : 'NO');
  const lines = [
    `ttr git guard on ${status.machine ?? '(unconfigured)'}: ${status.enabled ? 'ENABLED' : 'disabled'}`,
    `  home: ${status.home}`,
    `  pre-push hook: ${status.hook.installed ? `v${status.hook.version}${status.hook.current ? '' : ' (stale, run ttr git guard install)'}` : 'not installed'}`,
    `  global core.hooksPath active: ${yes(status.hook.globalActive)}${status.hook.globalHooksPath ? ` (${status.hook.globalHooksPath})` : ''}`,
    `  launcher present: ${status.hook.launcher ? yes(status.hook.launcher.present) : 'n/a'}`,
    `  gh guard active: ${yes(status.gh.active)} (first gh on PATH: ${status.gh.firstOnPath ?? 'none'})`,
  ];
  if (status.config)
    lines.push(
      `  guarded repos: ${status.config.repos.join(', ')}`,
      `  fast-forward only: ${status.config.ffOnlyBranches.join(', ')}`,
      `  allowlist: ${status.config.allowBranches.join(', ') || '(none)'}`,
      `  other existing branches: ${status.config.existingBranches}`
    );
  for (const repo of status.repos) {
    lines.push(
      `  repo ${repo.path}: ${repo.guarded ? 'guarded' : `BYPASSES the guard (hooksPath ${repo.effectiveHooksPath}); run ttr git guard install --repo ${repo.path}`}`
    );
    if (repo.undispatched.length)
      lines.push(
        `    not dispatched from ${repo.chain}: ${repo.undispatched.join(', ')}`
      );
  }
  for (const agent of status.agents)
    lines.push(
      `  agent MCP PR deny: ${agent.denied ? 'yes' : 'NO'} ${agent.path}${'error' in agent && agent.error ? ` (${agent.error})` : ''}`
    );
  lines.push(`  pending overrides: ${status.pendingOverrides.length}`);
  for (const override of status.pendingOverrides)
    lines.push(
      `    ${override.id} ${override.kind} ${override.repo} ${override.ref} until ${override.expiresAt} (${override.approvedBy}: ${override.reason})`
    );
  lines.push(`  last refusals: ${status.lastRefusals.length}`);
  for (const entry of status.lastRefusals)
    lines.push(
      `    ${entry.at} ${entry.kind} ${entry.repo} ${entry.ref ?? ''} ${entry.code ?? ''}`
    );
  return `${lines.join('\n')}\n`;
}
