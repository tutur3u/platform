import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

// Top-level tmp entries that are positively identified as tool scratch:
// mktemp (`tmp.XXXXXX`), the node `tmp` package (`tmp-<pid>-<random>`) and
// build/test tools that create disposable dirs under $TMPDIR. Anything else,
// such as a cloned repo or a hand-made folder, is never pruned as tmp.
const SCRATCH_NAMES = [
  /^tmp[.-][\w.-]{6,}$/u,
  /^(?:vitest|turbo|bunx?|next|esbuild|wrangler|miniflare|playwright|puppeteer_dev_chrome_profile|jest|metro|haste-map|node-compile-cache|v8-compile-cache|npm|yarn|pnpm|go-build|pip|ttr)(?:[-_.][\w.-]*)?$/u,
];

export function isScratchDirName(name: string) {
  return SCRATCH_NAMES.some((pattern) => pattern.test(name));
}

/**
 * True when the tree holds a git checkout, linked worktree (`.git` file) or
 * bare repository anywhere inside it. Unreadable or oversized trees count as
 * containing one (fail closed), so they are never pruned as scratch.
 */
export function containsGitRepository(
  path: string,
  { maxEntries = 500_000 }: { maxEntries?: number } = {}
) {
  let seen = 0;
  const pending = [path];
  try {
    while (pending.length) {
      const dir = pending.pop()!;
      const names = readdirSync(dir);
      if (names.includes('.git')) return true;
      if (['HEAD', 'objects', 'refs'].every((name) => names.includes(name)))
        return true;
      for (const name of names) {
        if (++seen > maxEntries) return true;
        const child = join(dir, name);
        const info = lstatSync(child);
        if (info.isDirectory() && !info.isSymbolicLink()) pending.push(child);
      }
    }
    return false;
  } catch {
    return true;
  }
}

/** Why a tmp dir may not be pruned, or null when it is removable scratch. */
export function tmpScratchRejection(path: string, name: string) {
  if (!isScratchDirName(name)) return 'not an identified scratch dir';
  if (containsGitRepository(path)) return 'contains a git repository';
  return null;
}

type NpmConfigExec = () => { status: number | null; stdout: string };

/**
 * The npm cache root npm itself would use: `npm_config_cache` from the
 * environment, else `npm config get cache`, else `~/.npm`. Resolved once so
 * the measured `_cacache` and the pinned `npm cache clean --cache` agree.
 */
export function resolveNpmCacheRoot({
  home = homedir(),
  env = process.env,
  exec = () =>
    spawnSync('npm', ['config', 'get', 'cache'], {
      cwd: home,
      encoding: 'utf8',
      timeout: 10_000,
    }),
}: {
  home?: string;
  env?: NodeJS.ProcessEnv;
  exec?: NpmConfigExec;
} = {}) {
  const fromEnv = Object.entries(env).find(
    ([key, value]) => key.toLowerCase() === 'npm_config_cache' && value
  )?.[1];
  if (fromEnv && isAbsolute(fromEnv)) return fromEnv;
  try {
    const result = exec();
    const configured = result.stdout?.trim();
    if (result.status === 0 && configured && isAbsolute(configured))
      return configured;
  } catch {
    /* npm is missing or failed; fall back to its default location. */
  }
  return join(home, '.npm');
}
