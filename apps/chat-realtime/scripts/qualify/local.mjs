// Local-only qualification: runs the Worker in workerd behind a fixed
// loopback port (the Web API's CHAT_REALTIME_URL), loses a revocation publish
// on purpose and recovers it with the real Cron Control processor, and
// exercises the stop fence with the portable client's fallback to polling.
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../../scripts/ci/cf-vite-worker.mjs';
import { createChatRealtimeConnection } from '../../../../packages/realtime/src/chat/client.ts';
import { check } from './env.mjs';
import { openRoom, refused } from './rooms.mjs';
import { runStoppedScenarios } from './scenarios.mjs';

const workerRoot = fileURLToPath(new URL('../..', import.meta.url));
const SLOT_MS = 5 * 60_000;
const RECOVERY_HOST = 'supabase.qualify.invalid';
const recoveryRunner = fileURLToPath(
  new URL('./recover-runner.mjs', import.meta.url)
);

/** A TCP relay so the Worker can restart on a new port behind a fixed one. */
function startRelay(port) {
  let target = null;
  const sockets = new Set();
  const server = net.createServer((client) => {
    if (!target) return client.destroy();
    const upstream = net.connect(target, '127.0.0.1');
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => socket.destroy());
    }
    client.pipe(upstream).pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        point(nextPort) {
          target = nextPort;
          for (const socket of sockets) socket.destroy();
        },
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      })
    );
  });
}

export async function startLocalWorker(config) {
  const relay = await startRelay(config.realtimePort);
  let worker = null;
  const start = async (stopped) => {
    await worker?.close();
    worker = await startCfViteWorker({
      mode: 'source',
      root: workerRoot,
      secrets: {
        CHAT_REALTIME_STOPPED: stopped ? 'true' : 'false',
        CHAT_REALTIME_TOKEN_SECRET: config.realtimeSecret,
      },
    });
    relay.point(Number(new URL(worker.origin).port));
  };
  await start(false);
  return {
    origin: `http://127.0.0.1:${config.realtimePort}`,
    restart: start,
    async close() {
      await relay.close();
      await worker?.close();
    },
  };
}

async function leaveWithoutPublish(config, userId, conversationId) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/rpc/chat_delete_conversation`,
    {
      body: JSON.stringify({
        p_actor_user_id: userId,
        p_conversation_id: conversationId,
        p_ws_id: config.workspaceId,
      }),
      headers: {
        apikey: config.secretKey,
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Profile': 'private',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
  check(response.ok, `private leave RPC returned ${response.status}`);
}

function runRecovery(config, origin) {
  const child = spawnSync('bun', [recoveryRunner], {
    encoding: 'utf8',
    input: JSON.stringify({
      publishUrl: new URL('/v1/publish', origin).href,
      realtimeSecret: config.realtimeSecret,
      recoveryUrl: `https://${RECOVERY_HOST}`,
      secretKey: config.secretKey,
      supabaseUrl: config.supabaseUrl,
    }),
    timeout: 60_000,
  });
  check(child.status === 0, `recovery runner exited ${child.status}`);
  return JSON.parse(child.stdout.trim().split('\n').at(-1));
}

export async function runRecoveryScenario(context, worker) {
  const { config, report, sessions, web } = context;
  const { a, b } = sessions;
  const wsId = config.workspaceId;
  let staleTicket;
  let room;
  let conversation;

  await report.step(
    'a lost leave publish keeps the member socket open',
    async () => {
      conversation = await web.createGroup(a, wsId, [b.userId]);
      staleTicket = await web.ticketJson(b, wsId, conversation.id);
      room = await openRoom(staleTicket);
      await leaveWithoutPublish(config, b.userId, conversation.id);
      await room.expectNone(() => false, 'unreachable', 2_000);
      check(room.closeInfo === null, 'socket closed without a publish');
    }
  );

  await report.step(
    'cron-control recovery delivers the revocation from the audit trail',
    async () => {
      const wait = SLOT_MS - (Date.now() % SLOT_MS) + 2_000;
      console.log(
        `wait ${Math.round(wait / 1_000)} s for the next recovery slot`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
      const result = runRecovery(config, worker.origin);
      check(result.outcome === 'ok', `recovery outcome ${result.outcome}`);
      check(result.detail.delivered >= 1, 'recovery delivered nothing');
      const closed = await Promise.race([
        room.closed,
        new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
      check(
        closed?.code === 4003,
        `member socket close code ${closed?.code ?? 'none'}`
      );
      check(
        await refused(staleTicket),
        'a ticket issued before leaving reconnected'
      );
    }
  );

  await web.leave(a, wsId, conversation.id).catch(() => undefined);
}

export async function runStopFenceScenario(context, worker) {
  const { config, report, sessions, web } = context;
  const wsId = config.workspaceId;
  const statuses = [];
  let resyncs = 0;
  const waitFor = async (status, timeoutMs) => {
    const until = Date.now() + timeoutMs;
    while (connection.status !== status) {
      check(
        Date.now() < until,
        `client status ${connection.status}, expected ${status}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const connection = createChatRealtimeConnection({
    getTicket: () => web.ticketJson(sessions.a, wsId),
    onFrame: () => undefined,
    onResync: () => {
      resyncs += 1;
    },
    onStatus: (status) => statuses.push(status),
    random: () => 0,
  });

  try {
    await report.step('client opens through a web-issued ticket', async () => {
      await waitFor('open', 15_000);
      check(resyncs === 1, 'first open did not refetch');
    });

    await report.step('stop fence drives the client to polling', async () => {
      await worker.restart(true);
      await waitFor('polling', 30_000);
      check(statuses.includes('connecting'), 'client never retried');
    });

    await runStoppedScenarios(context);

    await report.step(
      'client resumes and resyncs after the fence lifts',
      async () => {
        await worker.restart(false);
        connection.retry();
        await waitFor('open', 15_000);
        const until = Date.now() + 5_000;
        while (resyncs < 2 && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        check(resyncs >= 2, 'client did not resync from the restarted room');
      }
    );
  } finally {
    connection.close();
  }
}
