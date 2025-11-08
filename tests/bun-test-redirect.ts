// This script redirects 'bun test' to 'bun run test' (turbo + vitest)
// It runs before any tests are executed

import { spawn } from 'bun';

console.log('Redirecting to turbo test runner...\n');

const proc = spawn({
  cmd: ['bun', 'run', 'test'],
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
});

await proc.exited;
process.exit(proc.exitCode ?? 0);
