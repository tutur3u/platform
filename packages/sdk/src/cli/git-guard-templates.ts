import { GIT_GUARD_VERSION } from './git-guard-config';

export const shellQuote = (value: string) =>
  `'${value.replaceAll("'", "'\\''")}'`;

export const MANAGED_MARKER = '# Managed by ttr git guard';

/**
 * Client hooks the managed hooksPath dispatches. Each chains to the hook the
 * repository would otherwise run, so `.githooks/*`, Git LFS and similar keep
 * working. High-frequency hooks (reference-transaction, fsmonitor-watchman,
 * post-index-change) are deliberately not dispatched; `status` warns when a
 * chained directory relies on one.
 */
export const DISPATCHED_HOOKS = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'pre-merge-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'pre-auto-gc',
  'post-rewrite',
  'push-to-checkout',
  'sendemail-validate',
] as const;

export interface TemplateContext {
  runtime: string;
  entry: string;
  hooksDir: string;
  /** Global hooksPath that was configured before install, if any. */
  previousGlobal?: string;
  repos: string[];
}

const header = (name: string) =>
  `#!/bin/sh\n${MANAGED_MARKER} v${GIT_GUARD_VERSION} (${name})\n`;

/** Locate the hook this repository would have run without the guard. */
const chainLookup = (context: TemplateContext, name: string) => `
managed_dir=${shellQuote(context.hooksDir)}
top=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
common=$(git rev-parse --git-common-dir 2>/dev/null || echo .git)
case "$common" in /*) ;; *) common="$(pwd)/$common" ;; esac
chain=$(git config --get ttr-guard.chainHooksPath 2>/dev/null || true)
if [ -n "$chain" ]; then
  case "$chain" in /*) dir="$chain" ;; *) dir="$top/$chain" ;; esac
elif [ -n ${shellQuote(context.previousGlobal ?? '')} ]; then
  dir=${shellQuote(context.previousGlobal ?? '')}
else
  dir="$common/hooks"
fi
next="$dir/${name}"
if [ ! -x "$next" ] || [ "$(cd "$dir" 2>/dev/null && pwd -P)" = "$(cd "$managed_dir" 2>/dev/null && pwd -P)" ]; then
  next=""
fi
`;

export function dispatcherScript(context: TemplateContext, name: string) {
  if (name === 'pre-push') return prePushScript(context);
  return `${header(name)}${chainLookup(context, name)}
[ -n "$next" ] || exit 0
exec "$next" "$@"
`;
}

function prePushScript(context: TemplateContext) {
  const patterns = context.repos
    .map((repo) => `*${repo.toLowerCase()}*`)
    .join('|');
  return `${header('pre-push')}${chainLookup(context, 'pre-push')}
runtime=${shellQuote(context.runtime)}
entry=${shellQuote(context.entry)}
tmp=$(mktemp "\${TMPDIR:-/tmp}/ttr-git-guard.XXXXXX") || exit 1
trap 'rm -f "$tmp"' EXIT HUP INT TERM
cat > "$tmp"
if [ -x "$runtime" ] && [ -f "$entry" ]; then
  "$runtime" "$entry" git guard hook pre-push "$1" "$2" < "$tmp" || exit 1
else
  url=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')
  case "$url" in
    ${patterns || '__ttr_git_guard_none__'})
      echo "ttr git guard: the ttr CLI ($entry) is missing; refusing a push to a guarded repository. Reinstall with: ttr git guard install" >&2
      exit 1 ;;
  esac
fi
[ -n "$next" ] || exit 0
"$next" "$@" < "$tmp"
`;
}

/** gh shim: passes ordinary commands straight through without starting Bun. */
export function ghShimScript(context: TemplateContext, binDir: string) {
  return `#!/bin/sh
${MANAGED_MARKER} v${GIT_GUARD_VERSION} (gh)
self_dir=${shellQuote(binDir)}
self_real=$(cd "$self_dir" 2>/dev/null && pwd -P)
real=""
old_ifs=$IFS
IFS=:
for d in $PATH; do
  [ -n "$d" ] || continue
  [ -x "$d/gh" ] || continue
  [ "$(cd "$d" 2>/dev/null && pwd -P)" = "$self_real" ] && continue
  real="$d/gh"
  break
done
IFS=$old_ifs
if [ -z "$real" ]; then
  echo "ttr git guard: no real gh found on PATH" >&2
  exit 127
fi
case " $* " in
  *" pr "*|*" api "*|*" stack "*) ;;
  *) exec "$real" "$@" ;;
esac
runtime=${shellQuote(context.runtime)}
entry=${shellQuote(context.entry)}
if [ -x "$runtime" ] && [ -f "$entry" ]; then
  TTR_GIT_GUARD_REAL_GH="$real" exec "$runtime" "$entry" git guard gh -- "$@"
fi
case " $* " in
  *" pr create "*|*" pr new "*|*" api "*|*" stack submit "*)
    echo "ttr git guard: the ttr CLI ($entry) is missing; refusing a gh command that may create a pull request. Reinstall with: ttr git guard install" >&2
    exit 1 ;;
esac
exec "$real" "$@"
`;
}

export const SHELL_BLOCK_START = '# >>> ttr git guard >>>';
export const SHELL_BLOCK_END = '# <<< ttr git guard <<<';

export const shellBlock = (binDir: string) =>
  `${SHELL_BLOCK_START}\nexport PATH=${shellQuote(binDir)}:"$PATH"\n${SHELL_BLOCK_END}\n`;

export function stripShellBlock(content: string) {
  const begin = content.indexOf(SHELL_BLOCK_START);
  if (begin < 0) return content;
  const finish = content.indexOf(SHELL_BLOCK_END, begin);
  if (finish < 0)
    throw new Error(
      'Incomplete ttr git guard shell block; inspect it before modifying this file.'
    );
  return (
    content.slice(0, begin) +
    content.slice(finish + SHELL_BLOCK_END.length).replace(/^\r?\n/u, '')
  );
}
