// Hands a secret to the owner-approved command over a private inherited
// pipe (standard input or descriptor 3), never through a file or the
// agent. The command runs in `/` with a fixed minimal environment, and its
// output goes to /dev/null unless the operation sends it to the agent.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#delivery-on-the-machine.
import { spawn as nodeSpawn } from 'node:child_process';

export const DELIVERY_TIMEOUT_MS = 30_000;

export function childEnv(env = process.env) {
  const out = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
  for (const name of ['HOME', 'USER', 'LOGNAME', 'LANG', 'SSH_AUTH_SOCK'])
    if (typeof env[name] === 'string') out[name] = env[name];
  return out;
}

/**
 * Starts `op.argv` and writes `value` (plus a newline when the operation
 * asks) to its pipe, then closes the pipe. Resolves `delivered` once the
 * pipe accepted every byte, or `failed` when the command could not start,
 * closed the pipe early, or did not take the value within `timeoutMs` (then
 * it is stopped). `exit` resolves with the command's exit code.
 */
export function deliver(
  op,
  value,
  { spawn = nodeSpawn, timeoutMs = DELIVERY_TIMEOUT_MS, env = process.env } = {}
) {
  const output = op.output === 'agent' ? 'inherit' : 'ignore';
  const stdio =
    op.delivery === 'fd3'
      ? ['ignore', output, output, 'pipe']
      : ['pipe', output, output];
  let child;
  try {
    child = spawn(op.argv[0], op.argv.slice(1), {
      cwd: '/',
      env: childEnv(env),
      stdio,
    });
  } catch {
    return {
      delivered: Promise.resolve(false),
      exit: Promise.resolve(127),
      stop() {},
    };
  }
  const pipe = op.delivery === 'fd3' ? child.stdio[3] : child.stdin;
  const exit = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    child.on('error', () => resolve(127));
  });
  const delivered = new Promise((resolve) => {
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle(false);
    }, timeoutMs);
    child.on('error', () => settle(false));
    if (!pipe) return settle(false);
    pipe.on('error', () => settle(false));
    const payload = op.newline
      ? Buffer.concat([value, Buffer.from('\n')])
      : Buffer.from(value);
    pipe.end(payload, () => {
      payload.fill(0);
      settle(true);
    });
  });
  return {
    delivered,
    exit,
    stop() {
      child.kill('SIGTERM');
    },
  };
}
