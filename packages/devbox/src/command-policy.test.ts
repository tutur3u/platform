import { describe, expect, it } from 'vitest';
import { evaluateDevboxCommandPolicy } from './command-policy';

describe('evaluateDevboxCommandPolicy', () => {
  it.each([
    ['bun', 'check'],
    ['bun', 'test:e2e'],
    ['bun', 'sb:start'],
    ['bun', 'sb:reset'],
    ['bun', 'run', '--cwd', 'packages/sdk', 'test'],
    ['bun', 'run', 'build'],
    ['bun', 'run', '--cwd', 'apps/web', 'build'],
    ['bun', 'run', '--cwd', 'apps/web', 'start:app'],
    ['docker', 'compose', 'ps'],
    [
      'docker',
      'run',
      '--mount',
      'type=bind,source=./cache,target=/cache',
      'ubuntu',
    ],
    [
      'docker',
      'run',
      '--rm',
      '--network',
      'host',
      'cloudflare/cloudflared:latest',
      'tunnel',
      'run',
      '--token',
      '$CLOUDFLARED_TOKEN',
    ],
    ['cloudflared', 'tunnel', 'run', '--token', '$CLOUDFLARED_TOKEN'],
  ])('allows scoped remote workflow command %s', (...command) => {
    expect(evaluateDevboxCommandPolicy(command)).toMatchObject({
      allowed: true,
    });
  });

  it.each([
    ['rm', '-rf', '/'],
    ['sudo', 'apt', 'install', 'curl'],
    ['docker', 'system', 'prune', '--all', '--force'],
    ['docker', 'run', '--privileged', 'ubuntu'],
    ['docker', 'run', '--privileged=true', 'ubuntu'],
    ['docker', 'run', '-v', '/:/host', 'ubuntu'],
    ['docker', 'run', '--mount', 'type=bind,source=/,target=/host', 'ubuntu'],
    [
      'docker',
      'run',
      '--mount=type=bind,src=/var/run/docker.sock,target=/sock',
      'ubuntu',
    ],
    ['git', 'reset', '--hard'],
    ['cloudflared', 'tunnel', 'run', '--token', 'raw-token'],
    [
      'docker',
      'run',
      '--rm',
      'cloudflare/cloudflared:latest',
      'tunnel',
      'run',
      '--token',
      'raw-token',
    ],
    [
      'bash',
      '-lc',
      'docker run --rm cloudflare/cloudflared:latest tunnel run --token raw-token',
    ],
  ])('blocks unsafe remote command %s', (...command) => {
    const policy = evaluateDevboxCommandPolicy(command);

    expect(policy.allowed).toBe(false);
    expect(policy.reason).toBeTruthy();
  });
});
