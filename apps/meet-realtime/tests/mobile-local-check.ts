import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { RealtimeChannel } from '../../../packages/realtime/src/channels/channel';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import { repositoryRoot, startLocalWorker } from './local-worker';

/** Run through one resource claim; Wrangler and the Dart client share its fixture. */
const root = repositoryRoot;
const worker = await startLocalWorker();
const secret = worker.secret;
const topic = `task-board-${randomUUID()}`;
const webId = randomUUID();
const nativeId = randomUUID();
const endpoint = 'ws://127.0.0.1:8876/channels';
let nativeMessages = 0;
let nativeTickets = 0;
function ticket(userId: string) {
  return {
    endpoint,
    token: signRealtimePayload(
      {
        aud: 'tuturuuu.channels',
        kind: 'join',
        topic,
        userId,
        role: 'editor',
        exp: Math.floor(Date.now() / 1000) + 5,
      },
      secret
    ),
    user: { id: userId, user_metadata: {} },
    role: 'editor' as const,
  };
}
const channel = new RealtimeChannel(topic, {}, async () => ticket(webId));
let fixture: ReturnType<typeof Bun.serve> | undefined;
try {
  fixture = Bun.serve({
    hostname: '127.0.0.1',
    port: 8878,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/ticket') {
        nativeTickets++;
        return Response.json(ticket(nativeId));
      }
      if (path === '/observed')
        return Response.json({
          nativeId,
          nativeMessages,
          nativeTickets,
          presence: channel.presenceState(),
        });
      return new Response(null, { status: 404 });
    },
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Web peer did not join')),
      5000
    );
    channel
      .on<{ source: string }>(
        'broadcast',
        { event: 'native:hello' },
        ({ payload }) => {
          if (payload.source !== 'dart') return;
          nativeMessages++;
          void channel.send({
            type: 'broadcast',
            event: 'web:reply',
            payload: { source: 'web' },
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
  });
  const test = Bun.spawn(
    [
      'flutter',
      'test',
      '--no-pub',
      'test/core/realtime/cloudflare_worker_test.dart',
    ],
    {
      cwd: resolve(root, 'apps/mobile'),
      env: {
        ...process.env,
        TUTURUUU_REALTIME_TEST_FIXTURE: 'http://127.0.0.1:8878',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    }
  );
  assert.equal(
    await test.exited,
    0,
    'Dart/web Cloudflare interoperability failed'
  );
  assert.equal(nativeMessages, 1);
  assert(nativeTickets >= 2, 'Native channel did not refresh its ticket');
  console.log(
    'Real Cloudflare web/Dart interoperability passed: bidirectional events, account-bound presence and refresh without presence loss'
  );
} finally {
  fixture?.stop(true);
  await channel.unsubscribe();
  await worker.stop();
}
