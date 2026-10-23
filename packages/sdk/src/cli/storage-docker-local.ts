import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { Exec } from './storage-prune';

// Docker cleanup runs only against a verified local daemon. The ambient
// DOCKER_HOST, DOCKER_CONTEXT and current context could point at a remote
// engine (ssh://, tcp://, a cloud context), and pruning there would delete
// someone else's images or volumes. A daemon is local only when the current
// context's endpoint is a unix socket that exists on this machine and no
// DOCKER_HOST override is set; the destructive command is then pinned to that
// socket with `-H` and run with the overrides cleared.

export type LocalDocker =
  | { ok: true; host: string; argv: (args: string[]) => string[] }
  | { ok: false; reason: string };

export const dockerOverrides = { DOCKER_HOST: '', DOCKER_CONTEXT: '' };

export function verifyLocalDocker(
  exec: Exec,
  env: NodeJS.ProcessEnv = process.env,
  isSocket: (path: string) => boolean = (path) => {
    try {
      return statSync(path).isSocket();
    } catch {
      return false;
    }
  }
): LocalDocker {
  if (env.DOCKER_HOST?.trim())
    return {
      ok: false,
      reason: `DOCKER_HOST is set (${env.DOCKER_HOST.trim().slice(0, 80)}); only a verified local daemon is pruned`,
    };
  const result = exec([
    'docker',
    'context',
    'inspect',
    '--format',
    '{{json .Endpoints.docker.Host}}',
  ]);
  if (result.status !== 0)
    return {
      ok: false,
      reason: `cannot inspect the current Docker context: ${result.stderr.trim().slice(0, 200) || `status ${result.status}`}`,
    };
  let host: unknown;
  try {
    host = JSON.parse(result.stdout.trim());
  } catch {
    return { ok: false, reason: 'unreadable Docker context endpoint' };
  }
  if (typeof host !== 'string' || !host.startsWith('unix://'))
    return {
      ok: false,
      reason: `the current Docker context endpoint (${String(host).slice(0, 80)}) is not a local unix socket`,
    };
  const socket = host.slice('unix://'.length);
  if (!isAbsolute(socket) || !isSocket(socket))
    return {
      ok: false,
      reason: `Docker endpoint ${host} is not an existing local socket`,
    };
  return {
    ok: true,
    host,
    argv: (args) => ['docker', '-H', host, ...args],
  };
}
