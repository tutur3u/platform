import assert from 'node:assert/strict';
import './local-worker-check';
import { repositoryRoot, startLocalWorker } from './local-worker';

const worker = await startLocalWorker();
try {
  for (const probe of ['channels', 'documents', 'programming']) {
    const child = Bun.spawn(
      ['bun', `apps/meet-realtime/tests/${probe}-local-check.ts`],
      {
        cwd: repositoryRoot,
        env: { ...process.env, PROGRAMMING_LOCAL_TOKEN_SECRET: worker.secret },
        stdout: 'inherit',
        stderr: 'inherit',
      }
    );
    assert.equal(
      await child.exited,
      0,
      `${probe} Cloudflare integration failed`
    );
  }
} finally {
  await worker.stop();
}
