// Isolated proof that the Web ticket signer and publisher talk to workerd.
//
// Starts a second Supabase stack (its own project id and port block), seeds a
// chat fixture, then calls createChatRealtimeSubscribeTicket and
// publishChatRealtimeWorkerEvent against a local workerd. It does not boot
// Next. The conversation gate is the same private.chat_get_conversation RPC
// the ticket route calls. Output is PASS/FAIL names only.
//
//   bun --conditions=react-server apps/chat-realtime/scripts/probe-ticket-publish.mjs
// The Worker child is Node. Bun cannot load cloudflare.config.ts.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import {
  accessSync,
  constants,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatRealtimeConnection } from '../../../packages/realtime/src/chat/client.ts';
import {
  createChatRealtimeSubscribeTicket,
  publishChatRealtimeWorkerEvent,
} from '../../web/src/lib/chat/realtime-worker.ts';

const PROJECT_ID = 'chatrtprobe20';
const PORTS = {
  analytics: 18527,
  api: 18521,
  db: 18522,
  inbucket: 18524,
  inspector: 18528,
  pooler: 18529,
  shadow: 18520,
  studio: 18523,
};
const ID = {
  conversation: 'c9287000-0000-4000-8000-000000000021',
  message: 'c9287000-0000-4000-8000-000000000031',
  outsider: 'c9287000-0000-4000-8000-000000000004',
  peer: 'c9287000-0000-4000-8000-000000000002',
  user: 'c9287000-0000-4000-8000-000000000001',
  workspace: 'c9287000-0000-4000-8000-000000000011',
  workspaceOther: 'c9287000-0000-4000-8000-000000000012',
  workspaceOwner: 'c9287000-0000-4000-8000-000000000003',
};

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const databaseDir = path.join(repoRoot, 'apps/database/supabase');
const workerRoot = path.join(repoRoot, 'apps/chat-realtime');

function sqlFailure(stderr) {
  const line =
    stderr.split('\n').find((item) => item.startsWith('ERROR:')) ?? 'rejected';
  return line.replace(/[0-9a-f-]{8,}/gi, ':id').slice(0, 180);
}

function pass(name) {
  console.log(`PASS ${name}`);
}

function fail(name, reason) {
  // The reason stays off the log. CLI text can carry keys and URLs.
  void reason;
  console.error(`FAIL ${name}`);
  const error = new Error(name);
  error.safe = true;
  throw error;
}

function supabaseBin() {
  const candidates = [
    process.env.SUPABASE_BIN,
    path.join(repoRoot, 'apps/database/node_modules/.bin/supabase'),
    path.resolve(repoRoot, '../..', 'apps/database/node_modules/.bin/supabase'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next checkout's CLI.
    }
  }
  throw new Error('supabase CLI is not installed in this checkout');
}

function assertPortsFree(ports) {
  return Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve, reject) => {
          const server = net.createServer();
          server.once('error', () =>
            reject(new Error(`port ${port} is in use`))
          );
          server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
        })
    )
  );
}

function writeConfig(root) {
  const source = readFileSync(path.join(databaseDir, 'config.toml'), 'utf8');
  const replacements = new Map([
    ['project_id = "tuturuuu"', `project_id = "${PROJECT_ID}"`],
    ['port = 8001', `port = ${PORTS.api}`],
    ['port = 8002', `port = ${PORTS.db}`],
    ['shadow_port = 8000', `shadow_port = ${PORTS.shadow}`],
    ['port = 8009', `port = ${PORTS.pooler}`],
    ['port = 8003', `port = ${PORTS.studio}`],
    ['port = 8004', `port = ${PORTS.inbucket}`],
    ['inspector_port = 8083', `inspector_port = ${PORTS.inspector}`],
    ['port = 8007', `port = ${PORTS.analytics}`],
  ]);
  let seen = 0;
  const lines = source.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!replacements.has(trimmed)) return line;
    seen += 1;
    return line.replace(trimmed, replacements.get(trimmed));
  });
  if (seen !== replacements.size) {
    throw new Error('database config no longer matches the probe port map');
  }
  const config = lines.join('\n');
  const sharedPort = config.split('\n').find((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    return (
      trimmed === 'project_id = "tuturuuu"' ||
      /^[A-Za-z0-9_]*port\s*=\s*800[0-9]\b/.test(trimmed)
    );
  });
  if (sharedPort) {
    throw new Error('probe config still points at the shared database');
  }
  const supabaseDir = path.join(root, 'supabase');
  mkdirSync(supabaseDir);
  writeFileSync(path.join(supabaseDir, 'config.toml'), config);
  for (const name of ['migrations', 'templates', 'seed.sql']) {
    // The CLI rejects template paths that resolve outside the temp project,
    // and a symlink would also be broken inside the database container mount.
    cpSync(path.join(databaseDir, name), path.join(supabaseDir, name), {
      dereference: true,
      recursive: true,
    });
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const keep = (chunk) => {
      output = (output + chunk.toString()).slice(-200_000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}

function psqlStdin(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        `supabase_db_${PROJECT_ID}`,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-tA',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stderr, stdout }));
    child.stdin.end(sql);
  });
}

const SEED = `
insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data)
values
  ('${ID.user}', 'chat-probe-user@example.test', now(), '{}'::jsonb),
  ('${ID.peer}', 'chat-probe-peer@example.test', now(), '{}'::jsonb),
  ('${ID.workspaceOwner}', 'chat-probe-other@example.test', now(), '{}'::jsonb),
  ('${ID.outsider}', 'chat-probe-outsider@example.test', now(), '{}'::jsonb);
insert into public.users(id) values
  ('${ID.user}'), ('${ID.peer}'), ('${ID.workspaceOwner}'), ('${ID.outsider}')
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  ('${ID.workspace}', 'Chat probe', false, '${ID.user}'),
  ('${ID.workspaceOther}', 'Chat probe other', false, '${ID.workspaceOwner}');
insert into public.workspace_members(ws_id, user_id, type) values
  ('${ID.workspace}', '${ID.peer}', 'MEMBER');
insert into public.workspace_default_permissions(ws_id, permission, member_type, enabled) values
  ('${ID.workspace}', 'view_chat', 'MEMBER', true)
on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled;
insert into private.chat_conversations(id, ws_id, type, title, created_by) values
  ('${ID.conversation}', '${ID.workspace}', 'group', 'Chat probe', '${ID.user}');
insert into private.chat_conversation_members(conversation_id, user_id, role) values
  ('${ID.conversation}', '${ID.user}', 'owner'),
  ('${ID.conversation}', '${ID.peer}', 'member');
insert into private.chat_messages(id, conversation_id, sender_id, content) values
  ('${ID.message}', '${ID.conversation}', '${ID.user}', 'probe');
`;

async function waitFor(label, predicate, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= until) fail(label, 'timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function startNodeWorker(secret) {
  const script = path.join(workerRoot, 'scripts/probe-worker.mjs');
  const child = spawn('node', [script, workerRoot], {
    cwd: workerRoot,
    env: { ...process.env, CHAT_REALTIME_PROBE_SECRET: secret },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  return new Promise((resolve, reject) => {
    let timer;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      const error = new Error(message);
      error.safe = true;
      reject(error);
    };
    timer = setTimeout(() => fail('worker did not start'), 90_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const origin = stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^http:\/\/127\.0\.0\.1:\d+$/.test(line));
      if (!origin || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        origin,
        close: () =>
          new Promise((done) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              done();
              return;
            }
            const kill = setTimeout(() => child.kill('SIGKILL'), 10_000);
            child.once('exit', () => {
              clearTimeout(kill);
              done();
            });
            child.stdin.end();
          }),
      });
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4_000);
    });
    child.once('exit', (code) => {
      void stderr;
      fail(`worker exited ${code ?? 'signal'}`);
    });
    child.once('error', () => fail('worker did not start'));
  });
}

async function openInbox(userId, wsId) {
  const frames = [];
  const statuses = [];
  const connection = createChatRealtimeConnection({
    getTicket: async () => {
      const ticket = await createChatRealtimeSubscribeTicket({ userId, wsId });
      if (!ticket) throw new Error('ticket unavailable');
      return {
        enabled: true,
        expiresAt: ticket.expiresAt,
        ticket: ticket.ticket,
        url: ticket.url,
      };
    },
    onFrame(frame) {
      if (frame.t === 'event') frames.push(frame.event?.id ?? null);
    },
    onResync() {},
    onStatus(status) {
      statuses.push(status);
    },
  });
  await waitFor('socket opened', () => connection.status === 'open', 20_000);
  return { connection, frames, statuses };
}

async function main() {
  await assertPortsFree(Object.values(PORTS));
  const root = await mkdtemp(path.join(tmpdir(), `${PROJECT_ID}-`));
  let worker = null;
  const previousEnv = {
    CHAT_REALTIME_TOKEN_SECRET: process.env.CHAT_REALTIME_TOKEN_SECRET,
    CHAT_REALTIME_URL: process.env.CHAT_REALTIME_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    writeConfig(root);
    const started = await run(
      supabaseBin(),
      ['start', '--workdir', root, '--yes'],
      { cwd: root }
    );
    if (started.code !== 0) {
      fail('isolated database', `start exited ${started.code}`);
    }
    pass('isolated database');

    const seeded = await psqlStdin(SEED);
    if (seeded.code !== 0) fail('fixture seed', sqlFailure(seeded.stderr));
    pass('fixture seed');

    const member = await psqlStdin(
      `select (private.chat_get_conversation('${ID.workspace}', '${ID.conversation}', '${ID.user}') is not null)::text;`
    );
    if (member.code !== 0 || member.stdout.trim() !== 'true') {
      fail('member conversation gate', 'rpc did not return the conversation');
    }
    pass('member conversation gate');

    const outsider = await psqlStdin(
      `select private.chat_get_conversation('${ID.workspace}', '${ID.conversation}', '${ID.outsider}');`
    );
    const denied =
      outsider.code !== 0 &&
      /42501|chat_workspace_membership_required|chat_permission_required|chat_conversation_forbidden/.test(
        outsider.stderr
      );
    if (!denied)
      fail('outsider conversation gate', 'rpc did not deny the outsider');
    pass('outsider conversation gate');

    const secret = crypto.randomBytes(32).toString('hex');
    worker = await startNodeWorker(secret);
    process.env.NODE_ENV = 'development';
    process.env.CHAT_REALTIME_URL = worker.origin;
    process.env.CHAT_REALTIME_TOKEN_SECRET = secret;
    pass('workerd');

    const memberSocket = await openInbox(ID.user, ID.workspace);
    const peerSocket = await openInbox(ID.peer, ID.workspace);
    const otherSocket = await openInbox(ID.workspaceOwner, ID.workspaceOther);
    pass('inbox sockets');

    const eventId = crypto.randomUUID();
    const published = await publishChatRealtimeWorkerEvent({
      actorUserId: ID.user,
      audience: { scope: 'users', userIds: [ID.user] },
      conversationId: ID.conversation,
      id: eventId,
      message: { id: ID.message },
      sentAt: new Date().toISOString(),
      type: 'message.created',
      wsId: ID.workspace,
    });
    if (!Array.isArray(published)) fail('publish', 'publisher did not confirm');
    await waitFor(
      'member received the event',
      () => memberSocket.frames.includes(eventId),
      8_000
    );
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (
      peerSocket.frames.includes(eventId) ||
      otherSocket.frames.includes(eventId)
    ) {
      fail('audience isolation', 'another inbox received the event');
    }
    pass('member received the event');
    pass('audience isolation');
    memberSocket.connection.close();
    peerSocket.connection.close();
    otherSocket.connection.close();
  } finally {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await worker?.close().catch(() => undefined);
    const stopped = await run(
      supabaseBin(),
      ['stop', '--no-backup', '--workdir', root, '--yes'],
      { cwd: root }
    ).catch(() => ({ code: 1, output: '' }));
    if (stopped.code !== 0) await removeOwnedContainers();
    await rm(root, { force: true, recursive: true });
  }
}

function ownedContainerIds(output) {
  const owned = new RegExp(`(?:^|_)${PROJECT_ID}$`);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const tab = line.indexOf('\t');
      if (tab < 0) return [];
      const id = line.slice(0, tab).trim();
      const name = line.slice(tab + 1).trim();
      return id && owned.test(name) ? [id] : [];
    });
}

async function removeOwnedContainers() {
  const listed = await run('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${PROJECT_ID}`,
    '--format',
    '{{.ID}}\t{{.Names}}',
  ]);
  const ids = ownedContainerIds(listed.output);
  if (ids.length) await run('docker', ['rm', '-f', ...ids]);
}

main().catch((error) => {
  if (!error?.safe) console.error('FAIL probe');
  process.exitCode = 1;
});
