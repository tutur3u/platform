// Hands a secret to the owner-approved command over a private inherited
// pipe (standard input or descriptor 3), never through a file or the
// agent. The command runs in `/` with a fixed minimal environment taken
// from the OS account and the operations file, never from the requesting
// process, and its output goes to /dev/null unless the operation sends it
// to the agent.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#delivery-on-the-machine.
import { spawn as nodeSpawn } from 'node:child_process';
import os from 'node:os';

export const DELIVERY_TIMEOUT_MS = 30_000;

/**
 * The child's whole environment: identity from the OS account database, a
 * fixed locale, and `SSH_AUTH_SOCK` only when the operation names one.
 */
export function childEnv(op, account = os.userInfo()) {
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: account.homedir,
    USER: account.username,
    LOGNAME: account.username,
    LANG: 'en_US.UTF-8',
    ...(op.sshAuthSock ? { SSH_AUTH_SOCK: op.sshAuthSock } : {}),
  };
}

/**
 * Starts `op.argv` and writes `value` (plus a newline when the operation
 * asks) to its pipe, then closes the pipe. `delivered` resolves true once
 * the pipe accepted every byte: the value is in the command's input, which
 * does not prove the command read it (its exit code says how it went). It
 * resolves false when the command could not start, closed the pipe early,
 * or did not take the value within `timeoutMs` (then it is stopped). `exit`
 * resolves with the command's exit code.
 */
export function deliver(
  op,
  value,
  { spawn = nodeSpawn, timeoutMs = DELIVERY_TIMEOUT_MS, account } = {}
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
      env: childEnv(op, account),
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
  const payload = op.newline
    ? Buffer.concat([value, Buffer.from('\n')])
    : Buffer.from(value);
  const delivered = new Promise((resolve) => {
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      payload.fill(0);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle(false);
    }, timeoutMs);
    child.on('error', () => settle(false));
    if (!pipe) return settle(false);
    pipe.on('error', () => settle(false));
    // A failed write reaches this callback with its error, before the
    // stream's own `error` event.
    pipe.end(payload, (error) => settle(!error));
  });
  return {
    delivered,
    exit,
    stop() {
      child.kill('SIGTERM');
    },
  };
}
