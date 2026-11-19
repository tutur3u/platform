'use strict';

const { spawn } = require('node:child_process');

// Every host-side step is a fixed bash script sent on stdin; dynamic values go
// as positional arguments (validated SHAs, names and absolute paths) and the
// shard command travels base64-encoded, so no caller text is spliced into
// shell source.
const PRELUDE = `set -euo pipefail
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
# CI runs Node 24 and Bun 1.4.4; fleet hosts keep that pair under ~/tools.
# Later candidates take precedence; the pinned pair wins when present.
for pin in /opt/homebrew/opt/node@24/bin "$HOME"/.nvm/versions/node/v24.*/bin \\
  "$HOME"/tools/pinned-24.*/bin; do
  [ -x "$pin/node" ] && export PATH="$pin:$PATH"
done
# Some hosts pin the runtime their resource shims accept; ttr must run on it.
ttr_cmd() {
  if [ -n "\${FLEET_CI_TTR_RUNTIME:-}" ]; then
    "$FLEET_CI_TTR_RUNTIME" "$(command -v ttr)" "$@"
  else
    ttr "$@"
  fi
}
`;

const SCRIPTS = {
  probe: `${PRELUDE}repo="$1"
free=$(df -Pk "$repo" | awk 'NR==2{print int($4/1048576)}')
cpus=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)
load=$(uptime | sed -E 's/.*load averages?: *//' | awk -F'[, ]+' '{print $1}')
bun=0; command -v bun >/dev/null 2>&1 && bun=1
node=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
redis=0
if command -v redis-server >/dev/null 2>&1 || docker info >/dev/null 2>&1; then redis=1; fi
printf '{"freeGiB":%s,"cpus":%s,"load1":%s,"bun":%s,"node":%s,"redis":%s}\\n' "$free" "$cpus" "\${load:-0}" "$bun" "$node" "$redis"
`,
  // $4 is an optional bundle path for commits that are not on origin yet;
  // $5 is the optional runtime that ttr must run on.
  prepare: `${PRELUDE}repo="$1"; sha="$2"; name="$3"; bundle="\${4:-}"
FLEET_CI_TTR_RUNTIME="\${5:-}"
cd "$repo"
if [ -n "$bundle" ]; then
  git fetch -q origin main
  git fetch -q "$bundle" "refs/fleet-ci/$name"
elif ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
  git fetch -q origin "$sha" 2>/dev/null || git fetch -q origin
fi
git cat-file -e "$sha^{commit}"
wt="$repo/.worktrees/$name"
git worktree add -q --detach "$wt" "$sha"
cd "$wt"
gate=''
if command -v ttr >/dev/null 2>&1 && ttr_cmd resources run -- true >/dev/null 2>&1; then gate=ttr; fi
if [ "$gate" = ttr ]; then
  ttr_cmd resources run -- bun install --frozen-lockfile >/dev/null
else
  bun install --frozen-lockfile >/dev/null
fi
echo "FLEET_CI_GATE=\${gate:-none}"
`,
  run: `${PRELUDE}wt="$1"; gate="$2"; FLEET_CI_TTR_RUNTIME="\${4:-}"
cmd=$(printf %s "$3" | base64 -d 2>/dev/null || printf %s "$3" | base64 -D)
cd "$wt"
export CI=true FLEET_CI=1 TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
if [ "$gate" = ttr ]; then ttr_cmd resources run -- bash -c "$cmd"; exit; fi
exec bash -c "$cmd"
`,
  // Lists fleet worktrees on a host (used by --sweep).
  list: `${PRELUDE}repo="$1"
cd "$repo"
git worktree list --porcelain | sed -n 's#^worktree .*/.worktrees/\\(fleet-ci-[0-9a-f]*-[0-9]*\\)$#\\1#p'
`,
  cleanup: `${PRELUDE}repo="$1"; name="$2"
cd "$repo"
case "$name" in fleet-ci-*) ;; *) echo "refusing $name" >&2; exit 64;; esac
# Stop shard processes a dead controller left behind before removing files.
pkill -f "$repo/.worktrees/$name" 2>/dev/null || true
git worktree remove --force ".worktrees/$name" 2>/dev/null || rm -rf ".worktrees/$name"
git worktree prune
git update-ref -d "refs/fleet-ci/$name" 2>/dev/null || true
rm -f "/tmp/$name.bundle"
`,
};

// ttr resources exits 75 when it refuses admission (disk or pressure).
const ADMISSION_REFUSED = 75;

function validateArgs(args) {
  for (const value of args)
    if (typeof value !== 'string' || /[\0\n]/u.test(value))
      throw new Error('Invalid fleet CI argument');
}

/**
 * Run a named script on a host (ssh alias, or locally when ssh is null).
 * Resolves { code, stdout, stderr }; streams output to onData when given.
 */
function runScript(host, script, args, { onData, timeoutMs, spawnImpl } = {}) {
  validateArgs(args);
  const body = SCRIPTS[script];
  if (!body) throw new Error(`Unknown fleet CI script ${script}`);
  const argv = host.ssh
    ? [
        'ssh',
        [
          '-o',
          'BatchMode=yes',
          '-o',
          'ConnectTimeout=10',
          '-o',
          'ServerAliveInterval=30',
          host.ssh,
          'bash',
          '-s',
          '--',
          ...args.map(quote),
        ],
      ]
    : ['bash', ['-s', '--', ...args]];
  return new Promise((resolve) => {
    const child = (spawnImpl ?? spawn)(argv[0], argv[1], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs
      ? setTimeout(() => child.kill('SIGTERM'), timeoutMs)
      : null;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      onData?.(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      onData?.(chunk);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? (signal ? 124 : 1), stdout, stderr });
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: String(error) });
    });
    child.stdin.end(body);
  });
}

// ssh joins remote argv with spaces for the remote shell; quote each value.
function quote(value) {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

module.exports = { ADMISSION_REFUSED, SCRIPTS, quote, runScript };
