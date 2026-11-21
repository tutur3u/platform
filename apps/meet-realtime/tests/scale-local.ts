import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { MeetRealtimeServerMessage } from '../../../packages/realtime/src/meet/messages';
import { getMeetRealtimeScopesForRole } from '../../../packages/realtime/src/meet/permissions';
import { meetRealtimeTokenPayloadSchema } from '../../../packages/realtime/src/meet/primitives';
import { signMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';

const repo = resolve(import.meta.dir, '../../..');
assert(
  process.argv[2] && process.argv[3] && process.argv[5],
  'Use scale-local-run.py to allocate isolated persistence'
);
const mode = process.argv[4] ?? 'single';
assert(['single', 'parallel', 'drill'].includes(mode));
const stopFile = resolve(process.argv[2]);
const resultFile = resolve(process.argv[3]);
const directory = resolve(process.argv[5]);
const secret = crypto.randomUUID();
const stubSecret = crypto.randomUUID();
const wsId = crypto.randomUUID();
const limits = { maxParticipants: 100, maxPublishers: 8, maxViewers: 92 };
const deadline = Date.now() + 180_000;
let stop = false;
let fetches = 0;
let rejectedFetches = 0;
let active = 0;
let peakActive = 0;
let attempts = 0;
let malformedMessages = 0;
let unexpectedErrors = 0;
let commandsSent = 0;
let commandsAtFence: number | undefined;
let worker: Bun.Subprocess | undefined;
const rooms: Room[] = [];
const phases: unknown[] = [];
const results: Record<string, unknown> = {
  protocol: 'loopback workerd, session HTTP stub',
  limits,
  mode,
  phases,
};
let error: unknown;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    stop = true;
  });

const fixture = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    if (
      request.method !== 'POST' ||
      new URL(request.url).pathname !== '/v1/apps/fixture/sessions/new' ||
      request.headers.get('Authorization') !== `Bearer ${stubSecret}` ||
      fetches >= 230
    ) {
      rejectedFetches++;
      return new Response(null, { status: 403 });
    }
    fetches++;
    return Response.json({ sessionId: crypto.randomUUID() });
  },
});

type Frame = MeetRealtimeServerMessage;
type Command =
  | { type: 'sfu.session.create' }
  | { type: 'chat.message'; body: string };
type Client = {
  socket: WebSocket;
  token: string;
  frames: number;
  bytes: number;
  errors: number;
  chat: Map<string, number>;
  request: Map<string, (frame: Frame) => void>;
  joinMs: number;
  sessionMs?: number;
};
type Room = { id: string; clients: Client[]; ended: boolean; host?: Client };

function checkFence() {
  if (Date.now() >= deadline || existsSync(stopFile) || stop)
    throw new Error('stop fence');
}

async function until(check: () => boolean, timeoutMs: number) {
  const expires = Date.now() + timeoutMs;
  while (!check()) {
    checkFence();
    if (Date.now() >= expires) throw new Error('timeout');
    await Bun.sleep(20);
  }
}

function command(
  client: Client,
  message: Command,
  timeoutMs = 3500
): Promise<Frame> {
  checkFence();
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      client.request.delete(requestId);
      reject(new Error('command timeout'));
    }, timeoutMs);
    const done = (frame: Frame) => {
      clearTimeout(timeout);
      client.request.delete(requestId);
      if (frame.type === 'error') reject(new Error(frame.error));
      else resolve(frame);
    };
    client.request.set(requestId, done);
    try {
      client.socket.send(JSON.stringify({ ...message, requestId }));
      commandsSent++;
    } catch (cause) {
      clearTimeout(timeout);
      client.request.delete(requestId);
      reject(cause);
    }
  });
}

let origin: string;
let ready = false;
async function connect(room: Room, index: number, expectCap = false) {
  checkFence();
  assert(++attempts <= 230);
  assert(active < 150);
  const role = index === 0 ? 'host' : index < 8 ? 'speaker' : 'viewer';
  const token = signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      admission: 'open',
      exp: Math.floor(Date.now() / 1000) + 240,
      limits,
      meetingApp: 'meet',
      meetingId: room.id,
      roomId: `${wsId}:${room.id}`,
      role,
      scopes: getMeetRealtimeScopesForRole(role),
      userId: crypto.randomUUID(),
      wsId,
    }),
    secret
  );
  const started = performance.now();
  const socket = new WebSocket(
    `${origin.replace('http:', 'ws:')}/realtime?presenceDelta=1&token=${encodeURIComponent(token)}`
  );
  active++;
  peakActive = Math.max(peakActive, active);
  socket.addEventListener('close', () => active--, { once: true });
  const client: Client = {
    socket,
    token,
    frames: 0,
    bytes: 0,
    errors: 0,
    chat: new Map(),
    request: new Map(),
    joinMs: 0,
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('join timeout')), 5000);
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('socket upgrade error'));
        },
        { once: true }
      );
      socket.addEventListener(
        'close',
        () => {
          clearTimeout(timeout);
          reject(new Error('socket closed before ready'));
        },
        { once: true }
      );
      socket.addEventListener('message', (event) => {
        const raw = String(event.data);
        client.frames++;
        client.bytes += Buffer.byteLength(raw);
        let frame: Frame;
        try {
          frame = JSON.parse(raw);
        } catch {
          malformedMessages++;
          return;
        }
        if (!frame || typeof frame.type !== 'string') {
          malformedMessages++;
          return;
        }
        if (frame.type === 'chat.message')
          client.chat.set(frame.body, performance.now());
        if ('requestId' in frame && frame.requestId)
          client.request.get(frame.requestId)?.(frame);
        if (frame.type === 'error') {
          client.errors++;
          if (
            !(
              expectCap &&
              !client.joinMs &&
              frame.error === 'participant_limit_reached'
            )
          )
            unexpectedErrors++;
          if (!client.joinMs) {
            clearTimeout(timeout);
            reject(new Error(frame.error));
          }
        }
        if (frame.type === 'ready' && frame.admission === 'admitted') {
          clearTimeout(timeout);
          client.joinMs = performance.now() - started;
          resolve();
        }
      });
    });
    assert(!expectCap, 'expected cap to reject next connection');
    room.clients.push(client);
    if (role === 'host') room.host = client;
    if (mode === 'drill' && room === rooms[0] && index === 10) {
      commandsAtFence = commandsSent;
      writeFileSync(stopFile, 'stop\n');
    }
    const sfuStarted = performance.now();
    const session = await command(client, { type: 'sfu.session.create' });
    assert.equal(session.type, 'sfu.response');
    assert(
      session.result &&
        typeof session.result === 'object' &&
        'sessionId' in session.result &&
        typeof session.result.sessionId === 'string'
    );
    client.sessionMs = performance.now() - sfuStarted;
    return client;
  } catch (cause) {
    if (client.joinMs === 0 || expectCap) socket.close();
    throw cause;
  }
}

function percentiles(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q: number) =>
    Math.round(sorted[Math.ceil(sorted.length * q) - 1]! * 100) / 100;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), max: at(1) };
}

function runtime() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,time=,rss=,comm='], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const tree = new Set([worker?.pid]);
  const parsed = rows.map((row) => row.trim().split(/\s+/));
  for (let i = 0; i < 4; i++)
    for (const [pid, ppid] of parsed)
      if (tree.has(Number(ppid))) tree.add(Number(pid));
  return parsed.flatMap(([pid, , time, rss, executable]) =>
    tree.has(Number(pid)) && /workerd$/.test(executable!)
      ? [
          {
            pid: Number(pid),
            cpuSeconds: time!
              .split(':')
              .reduce((value, field) => value * 60 + Number(field), 0),
            rssMiB: Number(rss) / 1024,
          },
        ]
      : []
  );
}

async function ramp(room: Room, target: number) {
  const before = new Set(room.clients);
  const errors: string[] = [];
  const attempted = target - before.size;
  for (let index = before.size; index < target; index += 10) {
    checkFence();
    const count = Math.min(10, target - index);
    const wave = await Promise.allSettled(
      Array.from({ length: count }, (_, offset) =>
        connect(room, index + offset)
      )
    );
    errors.push(
      ...wave.flatMap((result) =>
        result.status === 'rejected' ? [String(result.reason)] : []
      )
    );
    assert(
      errors.length / (index + count - before.size) <= 0.1,
      JSON.stringify(errors)
    );
  }
  const clients = room.clients.filter((client) => !before.has(client));
  const label = `synthetic-fanout-${crypto.randomUUID()}`;
  assert(room.host, 'host needed for fan-out');
  const sent = performance.now();
  await command(room.host, { type: 'chat.message', body: label });
  await until(
    () => room.clients.every((client) => client.chat.has(label)),
    3500
  );
  return {
    target,
    attempted,
    admitted: room.clients.length,
    errors,
    joinMs: percentiles(clients.map((client) => client.joinMs)),
    sessionMs: percentiles(
      clients.flatMap((client) =>
        client.sessionMs === undefined ? [] : [client.sessionMs]
      )
    ),
    chatDeliveries: room.clients.length,
    fanoutMs: percentiles(
      room.clients.map((client) => client.chat.get(label)! - sent)
    ),
    cumulativeFrames: room.clients.reduce(
      (sum, client) => sum + client.frames,
      0
    ),
    cumulativeBytes: room.clients.reduce(
      (sum, client) => sum + client.bytes,
      0
    ),
    protocolErrors: room.clients.reduce(
      (sum, client) => sum + client.errors,
      0
    ),
  };
}

async function rampRooms(plans: { room: Room; target: number }[]) {
  const measured = await Promise.allSettled(
    plans.map(({ room, target }) =>
      ramp(room, target).catch((cause) => {
        stop = true;
        throw cause;
      })
    )
  );
  return measured.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

function createRoom(): Room {
  const room = { id: crypto.randomUUID(), clients: [], ended: false };
  rooms.push(room);
  return room;
}

async function end(room: Room) {
  const host = room.host;
  if (!host || room.ended) return;
  try {
    host.socket.send(
      JSON.stringify({ type: 'room.end', requestId: crypto.randomUUID() })
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`${origin}/room-state`, {
        headers: { Authorization: `Bearer ${host.token}` },
        signal: AbortSignal.timeout(1200),
      });
      if (response.ok && (await response.json()).ended === true) {
        room.ended = true;
        break;
      }
      await Bun.sleep(50);
    }
  } finally {
    for (const client of room.clients) client.socket.close();
  }
  assert(room.ended, 'room end was not confirmed');
}

try {
  const config = join(directory, 'wrangler.json');
  const probe = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response(null),
  });
  const port = probe.port;
  probe.stop(true);
  origin = `http://127.0.0.1:${port}`;
  writeFileSync(
    config,
    JSON.stringify({
      name: 'meet-scale-local',
      main: join(repo, 'apps/meet-realtime/src/worker.ts'),
      compatibility_date: '2026-06-20',
      compatibility_flags: ['nodejs_compat'],
      alias: {
        '@tuturuuu/types/primitives/playgrounds': join(
          repo,
          'packages/types/src/primitives/playgrounds.ts'
        ),
      },
      durable_objects: {
        bindings: [{ name: 'MEET_ROOM', class_name: 'MeetRoomDurableObject' }],
      },
      migrations: [
        { tag: 'fixture', new_sqlite_classes: ['MeetRoomDurableObject'] },
      ],
      vars: {
        MEET_REALTIME_TOKEN_SECRET: secret,
        CLOUDFLARE_REALTIME_APP_ID: 'fixture',
        CLOUDFLARE_REALTIME_APP_SECRET: stubSecret,
        CLOUDFLARE_REALTIME_API_BASE_URL: `http://127.0.0.1:${fixture.port}/v1`,
        MEET_AI_DISABLED: 'true',
        MEET_CLASS_ATTENDANCE_ENABLED: 'false',
      },
    })
  );
  worker = Bun.spawn(
    [
      process.env.MEET_SCALE_NODE ?? 'node',
      join(repo, 'apps/meet-realtime/node_modules/wrangler/bin/wrangler.js'),
      'dev',
      '--local',
      '--config',
      config,
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      join(directory, 'persist'),
    ],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH!,
        WRANGLER_SEND_METRICS: 'false',
        CI: 'true',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const output = Promise.all([
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  void output.then((lines) => {
    if (error) {
      const log = lines
        .join('\n')
        .replaceAll(secret, '[dummy]')
        .replaceAll(stubSecret, '[dummy]');
      writeFileSync(resultFile + '.worker.log', log);
      console.error(log.slice(0, 5500));
    }
  });
  void pollReady();
  await until(() => {
    assert.equal(worker?.exitCode, null, 'Worker stopped before readiness');
    return ready;
  }, 30_000);
  results.baselineRuntime = runtime();
  if (mode === 'parallel') {
    const parallel = Array.from({ length: 3 }, createRoom);
    results.parallel = await rampRooms(
      parallel.map((room) => ({ room, target: 40 }))
    );
    results.parallelRuntime = runtime();
  } else {
    const single = createRoom();
    for (const target of mode === 'drill' ? [10] : [10, 40, 80, 100]) {
      const phase = await ramp(single, target);
      phases.push({ ...phase, runtime: runtime() });
      console.log(JSON.stringify({ phase }));
    }
    if (mode === 'drill') {
      await assert.rejects(
        rampRooms([
          { room: single, target: 20 },
          { room: createRoom(), target: 10 },
        ]),
        /stop fence/
      );
      assert(attempts > 10 && commandsAtFence !== undefined);
      assert.equal(commandsSent, commandsAtFence);
      results.fenceReached = true;
      results.commandsAfterFence = commandsSent - commandsAtFence;
    } else {
      await assert.rejects(
        connect(single, 100, true),
        /participant_limit_reached/
      );
      results.scale150 = {
        planned: 150,
        attemptedThrough: 101,
        admitted: 100,
        reason: 'participant_limit_reached',
      };
    }
  }
} catch (cause) {
  error = cause;
  results.error = String(cause);
} finally {
  results.cleanup = await Promise.allSettled(rooms.map(end));
  for (const room of rooms)
    for (const client of room.clients) client.socket.close();
  fixture.stop(true);
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await Promise.race([worker.exited, Bun.sleep(2000)]);
    if (worker.exitCode === null) worker.kill('SIGKILL');
    await worker.exited;
  }
  const roomsEnded = rooms.filter((room) => room.ended).length;
  if (mode === 'drill' && roomsEnded !== 2) {
    error ??= new Error('Stop drill did not verify both room closures');
    results.error = String(error);
  }
  Object.assign(results, {
    roomsEnded,
    peakActive,
    attempts,
    stubRequests: fetches,
    rejectedStubRequests: rejectedFetches,
    malformedMessages,
    unexpectedErrors,
  });
  writeFileSync(resultFile, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
  if (
    error ||
    malformedMessages ||
    rejectedFetches ||
    unexpectedErrors ||
    rooms.some((room) => room.clients.length && !room.ended)
  )
    process.exitCode = 1;
}

async function pollReady() {
  while (Date.now() < deadline && !ready && worker?.exitCode === null) {
    try {
      ready = (
        await fetch(`${origin}/health`, { signal: AbortSignal.timeout(300) })
      ).ok;
    } catch {}
    if (!ready) await Bun.sleep(150);
  }
}
