import { spawnSync } from 'node:child_process';
import { hostname as machineHostname } from 'node:os';

const M4_HOSTNAME = 'Mac-Mini-M4';
const M4_HOST_ID = 'm4';

export function checkHostId(
  hostId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
) {
  if (hostId != null && hostId !== '') return hostId;
  const fromEnv = (env.TTR_HOST_ID ?? env.TTR_STORAGE_HOST_ID ?? '').trim();
  return fromEnv || null;
}

export function checkRefusal(host: {
  hostname: string;
  hostId: string | null;
}) {
  if (host.hostname.includes(M4_HOSTNAME)) return 'hostname' as const;
  if (host.hostId === M4_HOST_ID) return 'host-id' as const;
  return null;
}

type Spawn = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: 'inherit';
  }
) => { status: number | null };

// Runs the repo check:changed gate. Node's test cap stays the gate's
// `--test-concurrency=2`. This command refuses the M4 hub before spawning.
export async function runCheckCommand(
  argv: string[] = [],
  deps: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    hostId?: string | null;
    hostname?: string;
    spawn?: Spawn;
    stderr?: { write: (text: string) => void };
  } = {}
) {
  const env = deps.env ?? process.env;
  const refusal = checkRefusal({
    hostname: deps.hostname ?? machineHostname(),
    hostId: checkHostId(deps.hostId, env),
  });
  if (refusal) {
    (deps.stderr ?? process.stderr).write(
      `ttr check refused on the M4 hub (${refusal}).\n`
    );
    return 2;
  }
  const result = (deps.spawn ?? (spawnSync as Spawn))(
    'bun',
    ['check:changed', ...argv],
    {
      cwd: deps.cwd ?? process.cwd(),
      env: {
        ...env,
        TURBO_CONCURRENCY: '2',
        VITEST_MAX_WORKERS: '2',
      },
      stdio: 'inherit',
    }
  );
  return result.status ?? 1;
}
