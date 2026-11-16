import { spawnSync } from 'node:child_process';

export function gitGuardHelp() {
  return `ttr git guard — refuse new remote branches and pull requests on configured machines

Usage: ttr git guard <install|refresh|uninstall|status|allow-once|log> [options]

  install            install the managed pre-push hook (global core.hooksPath,
                     chaining to each repo's own hooks) and the gh shim
    --repo <path>    also repoint a clone whose local core.hooksPath bypasses
                     the global one (repeatable; default: the current repo)
    --shell <zsh|bash|none>   shell files that put the gh shim first on PATH
    --machine <name>          machine name for logs (default: hostname)
    --allow-branch <glob>     add an allowlisted branch pattern (repeatable)
    --existing-branches <refuse|allow>   other existing branches (default refuse)
    --agents                  also deny GitHub MCP pull-request tools in agent
                              settings (backed up; only adds rules; uninstall removes them)
  refresh            rewrite hook and shim for the running CLI (ttr upgrade runs it)
  uninstall          restore the previous hooksPath and shell files
  status [--json] [--repo <path>]   hook, gh guard, clones, overrides, refusals
  allow-once --kind <push|pr> --repo <owner/repo> [--ref <branch>]
             --reason "<why>" --approved-by <who> [--ttl-minutes 15]
                     one logged, single-use exception (no env-var bypass exists)
  log [--json] [--limit 20]        recent guard log entries

Pushes to guarded repos may only fast-forward main/production, update existing
release-please branches, delete other branches, push tags, or push allowlisted
branches. Everything else is refused before any network write.
`;
}

function parse(args: string[]) {
  const flags: Record<string, string[]> = {};
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split(/=(.*)/su);
      const next = args[index + 1];
      const boolean = ['json', 'help', 'agents'].includes(name!);
      const value =
        inline ?? (boolean || next === undefined ? 'true' : args[++index]!);
      const key = name!;
      flags[key] = [...(flags[key] ?? []), value];
      continue;
    }
    positionals.push(arg);
  }
  const one = (name: string) => flags[name]?.at(-1);
  return { flags, positionals, one };
}

const write = (text: string) => process.stdout.write(text);

export async function runGitCommand(args: string[]) {
  const [scope, action, ...rest] = args;
  if (
    scope !== 'guard' ||
    !action ||
    action === 'help' ||
    args.includes('-h')
  ) {
    write(gitGuardHelp());
    if (scope && scope !== 'guard') process.exitCode = 1;
    return;
  }

  if (action === 'hook') {
    const [hookName, remoteName, remoteUrl] = rest;
    if (hookName !== 'pre-push')
      throw new Error(`Unsupported guard hook: ${hookName ?? '(none)'}`);
    const { runPrePushGuard } = await import('./git-guard-hook.js');
    const input = await new Promise<string>((resolveInput) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolveInput(data));
    });
    process.exitCode = await runPrePushGuard({ remoteName, remoteUrl, input });
    return;
  }

  if (action === 'gh') {
    const separator = rest.indexOf('--');
    const ghArgs = separator >= 0 ? rest.slice(separator + 1) : rest;
    const real = process.env.TTR_GIT_GUARD_REAL_GH;
    if (!real) throw new Error('TTR_GIT_GUARD_REAL_GH is not set.');
    const { checkGhInvocation } = await import('./git-guard-gh.js');
    if (await checkGhInvocation({ argv: ghArgs })) {
      process.exitCode = 1;
      return;
    }
    const result = spawnSync(real, ghArgs, { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
    return;
  }

  const { flags, one } = parse(rest);
  const json = one('json') === 'true';

  if (action === 'install' || action === 'refresh') {
    const { installGitGuard, refreshGitGuardIfEnabled } =
      await import('./git-guard-install.js');
    if (action === 'refresh') {
      const result = await refreshGitGuardIfEnabled();
      write(
        json
          ? `${JSON.stringify({ refreshed: Boolean(result) })}\n`
          : result
            ? 'ttr git guard refreshed.\n'
            : 'ttr git guard is not installed; nothing to refresh.\n'
      );
      return;
    }
    const existing = one('existing-branches');
    if (existing && !['allow', 'refuse'].includes(existing))
      throw new Error('--existing-branches must be allow or refuse.');
    const { readGitGuardConfig } = await import('./git-guard-config.js');
    const current = await readGitGuardConfig();
    const allow = flags['allow-branch'] ?? [];
    const result = await installGitGuard({
      repos: flags.repo ?? [process.cwd()],
      shell: one('shell'),
      agents: one('agents') === 'true',
      config: {
        ...(one('machine') ? { machine: one('machine') } : {}),
        ...(existing
          ? { existingBranches: existing as 'allow' | 'refuse' }
          : {}),
        ...(allow.length
          ? {
              allowBranches: [
                ...new Set([...(current?.allowBranches ?? []), ...allow]),
              ],
            }
          : {}),
      },
    });
    write(
      json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `ttr git guard installed for ${result.config.machine} (repos: ${result.config.repos.join(', ')}).\nOpen a new shell so the gh guard is first on PATH, then check: ttr git guard status\n`
    );
    return;
  }

  if (action === 'uninstall') {
    const { uninstallGitGuard } = await import('./git-guard-install.js');
    await uninstallGitGuard();
    write('ttr git guard uninstalled; previous hooksPath restored.\n');
    return;
  }

  if (action === 'status') {
    const { gitGuardStatus, renderGitGuardStatus } =
      await import('./git-guard-status.js');
    const status = await gitGuardStatus({ repos: flags.repo });
    write(
      json
        ? `${JSON.stringify(status, null, 2)}\n`
        : renderGitGuardStatus(status)
    );
    return;
  }

  if (action === 'allow-once') {
    const kind = one('kind');
    if (kind !== 'push' && kind !== 'pr')
      throw new Error('allow-once needs --kind push or --kind pr.');
    const repo = one('repo');
    if (!repo) throw new Error('allow-once needs --repo <owner/repo>.');
    const { readGitGuardConfig, repoSlugFromRemote } =
      await import('./git-guard-config.js');
    const config = await readGitGuardConfig();
    if (!config?.enabled)
      throw new Error('ttr git guard is not enabled on this machine.');
    const slug = repoSlugFromRemote(repo);
    if (!slug) throw new Error(`Invalid --repo: ${repo}`);
    const ttl = one('ttl-minutes');
    const { createOverride } = await import('./git-guard-log.js');
    const override = await createOverride({
      kind,
      repo: slug,
      ref: one('ref'),
      reason: one('reason'),
      approvedBy: one('approved-by'),
      ttlMinutes: ttl ? Number(ttl) : undefined,
      machine: config.machine,
    });
    write(
      json
        ? `${JSON.stringify(override, null, 2)}\n`
        : `Override ${override.id} created (logged): one ${kind} on ${override.repo} ${override.ref}, until ${override.expiresAt}.\n`
    );
    return;
  }

  if (action === 'log') {
    const { readGuardLog } = await import('./git-guard-log.js');
    const entries = await readGuardLog(undefined, Number(one('limit') ?? 20));
    write(
      json
        ? `${JSON.stringify(entries, null, 2)}\n`
        : entries
            .map((entry) =>
              `${entry.at} ${entry.event} ${entry.kind ?? ''} ${entry.repo ?? ''} ${entry.ref ?? ''} ${entry.code ?? entry.reason ?? ''}`.replace(
                /\s+/gu,
                ' '
              )
            )
            .join('\n') + (entries.length ? '\n' : '')
    );
    return;
  }

  throw new Error(
    `Unknown git guard action "${action}". Use ttr git guard help.`
  );
}
