import { execFileSync } from 'node:child_process';
import {
  assertSyntheticCliEnvironment,
  hostedDockerEndpoint,
} from './cli-environment.mjs';

// Every inventory, inspection and cleanup verification uses the same local
// endpoint and private config as the lifecycle child, never the ambient daemon.
export function runHostedCommand(
  binary,
  args,
  {
    context,
    timeout = 5000,
    maxBuffer = 4 * 1024 ** 2,
    cwd,
    execute = execFileSync,
  } = {}
) {
  assertSyntheticCliEnvironment(context?.env, context?.cwd);
  const argv =
    binary === 'docker'
      ? [
          '--host',
          hostedDockerEndpoint,
          '--config',
          context.env.DOCKER_CONFIG,
          ...args,
        ]
      : args;
  return execute(binary, argv, {
    env: context.env,
    cwd: cwd ?? context.cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
