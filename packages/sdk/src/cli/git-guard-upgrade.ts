import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { gitGuardHome, guardPaths } from './git-guard-config';

/**
 * After `ttr upgrade` swaps the CLI, let the NEW code rewrite the managed hook
 * and gh shim. Best effort: an upgrade never fails because of the guard, but a
 * failed refresh is reported, never silent. No-op when the guard is absent.
 */
export function refreshGuardAfterUpgrade(
  entry: string,
  options: {
    runtime?: string;
    home?: string;
    run?: typeof spawnSync;
    stderr?: (text: string) => void;
  } = {}
) {
  const home = options.home ?? gitGuardHome();
  if (!existsSync(guardPaths(home).manifest)) return 'absent' as const;
  const run = options.run ?? spawnSync;
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  const result = run(
    options.runtime ?? process.execPath,
    [entry, 'git', 'guard', 'refresh', '--json'],
    { encoding: 'utf8', env: { ...process.env, TTR_GIT_GUARD_HOME: home } }
  );
  if (result.status === 0) return 'refreshed' as const;
  stderr(
    `Warning: ttr git guard refresh failed after upgrade (exit ${result.status ?? 'unknown'}); run ttr git guard install.\n`
  );
  return 'failed' as const;
}
