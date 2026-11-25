import { expect, it } from 'vitest';
import { runInFreshContainer } from './container-run.ts';

it.each([
  { description: 'no export', files: null, expectedExport: {} },
  { description: 'an empty export', files: [], expectedExport: { files: [] } },
])('preserves normal completion with $description', async ({
  files,
  expectedExport,
}) => {
  const result = { exitCode: 0, output: 'hi', outcome: 'exited' };
  const container = {
    running: false,
    images: { toolchain: 'fixture-digest' },
    start() {
      this.running = true;
    },
    async setInactivityTimeout() {},
    async exec() {
      return {
        stdout: new Blob([JSON.stringify({ ...result, files })]).stream(),
        exitCode: Promise.resolve(0),
      };
    },
    async destroy() {
      this.running = false;
    },
  };

  await expect(
    runInFreshContainer(
      container,
      { command: 'printf hi', files: [] },
      Date.now() + 5000
    )
  ).resolves.toStrictEqual({ ...result, ...expectedExport });
});
