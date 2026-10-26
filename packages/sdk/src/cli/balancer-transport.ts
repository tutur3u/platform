import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { writeFileAtomically } from './atomic-file';
import type { BalancerHost } from './balancer-placement';

export type AgentAction = 'probe' | 'start' | 'status' | 'log' | 'cancel';
// `uncertain` means the request may have reached the host but no reply
// arrived: the caller must reconcile, never repeat a mutation blindly.
export type AgentReply =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; uncertain: boolean; error: string };

export interface BalancerTransport {
  call(
    host: BalancerHost,
    action: AgentAction,
    args?: string[],
    stdin?: string
  ): Promise<AgentReply>;
}

const SAFE_ARG = /^[A-Za-z0-9_-]{1,160}$/u;

const AGENT_FILES = [
  'balancer-host-agent',
  'balancer-host-common',
  'balancer-host-job',
] as const;

// The shipped agent bundle: three sibling files with their relative imports
// intact, installed under a directory named by the digest of all of them so
// a new version never replaces files beneath a running supervisor.
export function agentBundle() {
  const extension = extname(__filename) || '.js';
  const files = AGENT_FILES.map((base) => {
    const name = `${base}${extension}`;
    const bytes = readFileSync(join(__dirname, name));
    return {
      name,
      bytes,
      digest: createHash('sha256').update(bytes).digest('hex'),
    };
  });
  const digest = createHash('sha256');
  for (const file of files) digest.update(`${file.name}\0${file.digest}\0`);
  const id = digest.digest('hex').slice(0, 16);
  return { id, files, entry: files[0]!.name };
}

interface Exec {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
function exec(
  command: string,
  args: string[],
  input: string | Buffer | undefined,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<Exec> {
  return new Promise((done) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      done({ code: null, stdout, stderr, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr, timedOut });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

const lastJson = (text: string) => {
  const line = text.trim().split('\n').pop() ?? '';
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
};

function toReply(result: Exec, transportFailure: boolean): AgentReply {
  const value = lastJson(result.stdout);
  if (value?.ok === true) return { ok: true, value };
  if (value?.ok === false)
    return { ok: false, uncertain: false, error: String(value.error) };
  return {
    ok: false,
    uncertain: true,
    error: result.timedOut
      ? 'agent call timed out'
      : transportFailure
        ? 'host is unreachable'
        : `agent exited ${result.code ?? 'by signal'} without a reply`,
  };
}

const timeouts: Record<AgentAction, number> = {
  probe: 45_000,
  start: 60_000,
  status: 30_000,
  log: 30_000,
  cancel: 30_000,
};

/** Local host: install the agent beside the ledger and run it with bun. */
export function localTransport(home: string): BalancerTransport {
  const bun = existsSync(join(homedir(), '.bun', 'bin', 'bun'))
    ? join(homedir(), '.bun', 'bin', 'bun')
    : process.execPath;
  return {
    async call(_host, action, args = [], stdin) {
      if (args.some((arg) => !SAFE_ARG.test(arg)))
        return { ok: false, uncertain: false, error: 'unsafe agent argument' };
      const bundle = agentBundle();
      const dir = join(home, 'agent', bundle.id);
      for (const file of bundle.files)
        if (!existsSync(join(dir, file.name)))
          await writeFileAtomically(
            join(dir, file.name),
            file.bytes.toString('utf8'),
            {
              mode: 0o600,
              createDirectory: true,
              directoryMode: 0o700,
            }
          );
      const path = join(dir, bundle.entry);
      const env = { ...process.env, TTR_BALANCER_HOME: home };
      return toReply(
        await exec(bun, [path, action, ...args], stdin, timeouts[action], env),
        false
      );
    },
  };
}

/**
 * SSH host: the agent bundle is installed content-addressed under the
 * remote user's balancer home, each file verified by digest. Only fixed tokens and
 * pattern-checked IDs reach the remote shell; the run spec travels on stdin.
 */
export function sshTransport(): BalancerTransport {
  const installed = new Set<string>();
  const ssh = (
    alias: string,
    script: string,
    input: string | Buffer | undefined,
    timeoutMs: number
  ) =>
    exec(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=10',
        '-o',
        'ServerAliveInterval=15',
        '-o',
        'ServerAliveCountMax=3',
        alias,
        script,
      ],
      input,
      timeoutMs
    );
  return {
    async call(host, action, args = [], stdin) {
      if (host.transport.kind !== 'ssh')
        return {
          ok: false,
          uncertain: false,
          error: 'host is not an SSH host',
        };
      if (
        !SAFE_ARG.test(host.transport.alias) ||
        args.some((arg) => !SAFE_ARG.test(arg))
      )
        return { ok: false, uncertain: false, error: 'unsafe agent argument' };
      const alias = host.transport.alias;
      const bundle = agentBundle();
      const dir = `"$HOME/.tuturuuu/balancer/agent/${bundle.id}"`;
      if (!installed.has(`${alias}:${bundle.id}`)) {
        for (const file of bundle.files) {
          const install = await ssh(
            alias,
            [
              'umask 077',
              `d=${dir}`,
              'mkdir -p "$d"',
              `f="$d/${file.name}"`,
              'if [ ! -f "$f" ]; then cat > "$f.$$" && mv "$f.$$" "$f"; else cat > /dev/null; fi',
              '(sha256sum "$f" 2>/dev/null || shasum -a 256 "$f") | cut -c1-64',
            ].join('; '),
            file.bytes,
            60_000
          );
          if (install.code === 255 || install.timedOut)
            return { ok: false, uncertain: true, error: 'host is unreachable' };
          if (install.stdout.trim() !== file.digest)
            return {
              ok: false,
              uncertain: false,
              error: `installed ${file.name} does not match its digest`,
            };
        }
        installed.add(`${alias}:${bundle.id}`);
      }
      const result = await ssh(
        alias,
        `exec "$HOME/.bun/bin/bun" ${dir}/${bundle.entry} ${[action, ...args].join(' ')}`,
        stdin,
        timeouts[action]
      );
      return toReply(result, result.code === 255);
    },
  };
}

export function transportFor(
  host: BalancerHost,
  home: string,
  ssh: BalancerTransport
) {
  return host.transport.kind === 'local' ? localTransport(home) : ssh;
}
