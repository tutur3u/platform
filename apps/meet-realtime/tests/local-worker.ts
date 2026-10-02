import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';

export const repositoryRoot = resolve(import.meta.dir, '../../..');
/** Disposable Worker fixture. No deployed Cloudflare account or credentials. */
export async function startLocalWorker() {
  const secret = `local-${randomUUID()}`;
  const persistence = await mkdtemp(resolve(tmpdir(), 'ttr-realtime-'));
  const worker = Bun.spawn(
    [
      'bunx',
      'wrangler',
      'dev',
      '--local',
      '--config',
      'apps/meet-realtime/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8876',
      '--persist-to',
      persistence,
      '--var',
      `MEET_REALTIME_TOKEN_SECRET:${secret}`,
      '--var',
      'PLATFORM_API_BASE_URL:http://127.0.0.1:8877',
    ],
    { cwd: repositoryRoot, stdout: 'pipe', stderr: 'pipe' }
  );
  const output = new Response(worker.stdout).text();
  const errors = new Response(worker.stderr).text();
  const stop = async () => {
    worker.kill('SIGTERM');
    await worker.exited;
    await Promise.all([output, errors]);
    await rm(persistence, { recursive: true, force: true });
  };
  try {
    const deadline = Date.now() + 30000;
    while (true) {
      assert(
        worker.exitCode === null,
        'Local Worker exited before becoming ready'
      );
      try {
        const response = await fetch('http://127.0.0.1:8876/health', {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          const probe = new URL('/channels', 'http://127.0.0.1:8876');
          probe.searchParams.set(
            'token',
            signRealtimePayload(
              {
                aud: 'tuturuuu.channels',
                kind: 'join',
                topic: `fixture-${randomUUID()}`,
                userId: randomUUID(),
                role: 'viewer',
                exp: Math.floor(Date.now() / 1000) + 10,
              },
              secret
            )
          );
          const authorized = await fetch(probe, {
            signal: AbortSignal.timeout(1000),
          });
          if (authorized.status === 426) break;
        }
      } catch {
        /* Wait only for the loopback Worker. */
      }
      assert(Date.now() < deadline, 'Local Worker did not become ready');
      await Bun.sleep(100);
    }
    return { secret, stop };
  } catch (error) {
    await stop();
    const diagnostics = (await Promise.all([output, errors]))
      .join('\n')
      .replaceAll(secret, '[disposable secret]');
    console.error(diagnostics.slice(-6000));
    throw error;
  }
}
