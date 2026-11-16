import { spawnSync } from 'node:child_process';
import {
  gitGuardHome,
  isGuardedRepo,
  readGitGuardConfig,
  repoSlugFromRemote,
} from './git-guard-config';
import { appendGuardLog, consumeOverride } from './git-guard-log';
import {
  evaluatePush,
  parsePrePushInput,
  refusalMessage,
} from './git-guard-policy';

export function gitIsAncestor(cwd: string) {
  return (older: string, newer: string) =>
    spawnSync('git', ['merge-base', '--is-ancestor', older, newer], {
      cwd,
      stdio: 'ignore',
    }).status === 0;
}

/**
 * Run the pre-push guard. Returns the exit code for the hook; writes the
 * refusal to `stderr`. Every refusal, override consumption and guarded allow
 * is appended to the guard log. Non-guarded remotes return 0 untouched.
 */
export async function runPrePushGuard(options: {
  remoteName?: string;
  remoteUrl?: string;
  input: string;
  cwd?: string;
  home?: string;
  stderr?: (text: string) => void;
  isAncestor?: (older: string, newer: string) => boolean;
}) {
  const home = options.home ?? gitGuardHome();
  const cwd = options.cwd ?? process.cwd();
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  const config = await readGitGuardConfig(home);
  if (!config?.enabled) return 0;
  const repo =
    repoSlugFromRemote(options.remoteUrl) ??
    repoSlugFromRemote(options.remoteName);
  if (!isGuardedRepo(config, repo)) return 0;

  const decisions = evaluatePush(
    config,
    parsePrePushInput(options.input),
    options.isAncestor ?? gitIsAncestor(cwd)
  );
  const refused = [];
  for (const decision of decisions) {
    const base = {
      kind: 'push' as const,
      machine: config.machine,
      repo: repo!,
      ref: decision.ref,
      code: decision.code,
      cwd,
    };
    if (decision.allowed) {
      await appendGuardLog({ event: 'allowed', ...base }, home);
      continue;
    }
    const override = decision.overridable
      ? await consumeOverride(
          { kind: 'push', repo: repo!, ref: decision.ref },
          { machine: config.machine, cwd },
          home
        )
      : null;
    if (override) {
      stderr(
        `ttr git guard: ${decision.ref} allowed once by override ${override.id} (approved by ${override.approvedBy}: ${override.reason}).\n`
      );
      continue;
    }
    await appendGuardLog({ event: 'refused', ...base }, home);
    refused.push(decision);
  }
  if (!refused.length) return 0;
  stderr(refusalMessage(repo!, refused, config.machine));
  return 1;
}
