import { describe, expect, it } from 'vitest';
import { evaluateDevboxCommandPolicy } from './command-policy';

describe('evaluateDevboxCommandPolicy', () => {
  it.each([
    ['bun', 'check'],
    ['bun', 'test:e2e'],
    ['bun', 'sb:start'],
    ['bun', 'sb:reset'],
    ['bun', '--cwd', 'packages/sdk', 'test'],
    ['docker', 'compose', 'ps'],
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
    ['docker', 'run', '-v', '/:/host', 'ubuntu'],
    ['git', 'reset', '--hard'],
  ])('blocks host-destructive command %s', (...command) => {
    const policy = evaluateDevboxCommandPolicy(command);

    expect(policy.allowed).toBe(false);
    expect(policy.reason).toBeTruthy();
  });
});
