import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  type CollaborationTicket,
  collaborationTicketSchema,
  programmingDocumentSnapshot,
  Y,
} from '../../../packages/realtime/src/collaboration';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '../../../packages/realtime/src/core/token';

// Run against a locally started Wrangler worker, never a deployment.
const worker = new URL(
  process.env.PROGRAMMING_LOCAL_WORKER_URL ?? 'http://127.0.0.1:8876'
);
assert(
  ['127.0.0.1', 'localhost'].includes(worker.hostname),
  'Local checks require a loopback worker'
);
const secret = process.env.PROGRAMMING_LOCAL_TOKEN_SECRET;
assert(secret, 'Supply the same disposable local token secret as Wrangler');
const ownerId = randomUUID();
const resourceId = randomUUID();
const roomId = `playground:${resourceId}`;
const sockets: WebSocket[] = [];
const documents: Y.Doc[] = [];
const checkpoints: {
  files: { path: string; content: string }[];
  paths: string[];
  revision: number;
}[] = [];
let revision = 1;
function ticket(
  kind: CollaborationTicket['kind'],
  role: CollaborationTicket['role'] = 'owner',
  extra: Partial<CollaborationTicket> = {}
) {
  return signRealtimePayload(
    {
      aud: 'tuturuuu.collaboration',
      kind,
      role,
      ownerId,
      resourceId,
      roomId,
      resource: 'playground',
      userId: role === 'owner' ? ownerId : randomUUID(),
      displayName: 'Local fixture',
      exp: Math.floor(Date.now() / 1000) + 60,
      ...extra,
    },
    secret
  );
}
async function request(
  kind: 'seed' | 'checkpoint' | 'runner-files',
  method: string,
  body?: unknown,
  token = ticket(kind)
) {
  return fetch(new URL(`/collaboration/${kind}`, worker), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function until(test: () => boolean, label: string) {
  const deadline = Date.now() + 8000;
  while (!test() && Date.now() < deadline) await Bun.sleep(20);
  assert(test(), label);
}
async function connect(
  role: CollaborationTicket['role'],
  extra: Partial<CollaborationTicket> = {}
) {
  const url = new URL('/collaboration', worker);
  url.protocol = 'ws:';
  url.searchParams.set('token', ticket('join', role, extra));
  const socket = new WebSocket(url);
  sockets.push(socket);
  const doc = new Y.Doc();
  documents.push(doc);
  let synced = false;
  const messages: Record<string, unknown>[] = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    messages.push(message);
    if (['sync', 'update'].includes(message.type)) {
      Y.applyUpdate(doc, Buffer.from(message.update, 'base64'), 'remote');
      synced = true;
    }
  });
  await until(() => synced, `${role} receives the durable document`);
  const update = () =>
    socket.send(
      JSON.stringify({
        type: 'update',
        update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
      })
    );
  return { socket, doc, messages, update };
}
const callback = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PROGRAMMING_LOCAL_CALLBACK_PORT ?? 8877),
  async fetch(req) {
    assert.equal(
      new URL(req.url).pathname,
      '/api/v1/realtime/programming/checkpoint'
    );
    const raw = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const scope = collaborationTicketSchema.parse(
      verifyRealtimePayload(raw, secret)
    );
    if (scope.roomId !== roomId) return new Response(null, { status: 403 });
    assert.equal(scope.kind, 'checkpoint');
    assert.equal(scope.role, 'owner');
    assert.equal(scope.ownerId, ownerId);
    assert.equal(scope.resourceId, resourceId);
    assert.equal(scope.roomId, roomId);
    const body = (await req.json()) as (typeof checkpoints)[number];
    assert.equal(body.revision, revision);
    checkpoints.push(body);
    revision++;
    return Response.json({ revision });
  },
});
try {
  assert.equal(
    (await request('seed', 'GET', undefined, 'invalid')).status,
    401
  );
  assert.equal(
    (
      await request(
        'seed',
        'GET',
        undefined,
        ticket('seed', 'owner', { exp: 1 })
      )
    ).status,
    401
  );
  assert.equal(
    (
      await request('seed', 'POST', {
        revision: 1,
        files: [
          { path: 'main.py', content: 'print(1)\n' },
          { path: 'keep.txt', content: 'unchanged' },
        ],
        command: 'python main.py',
      })
    ).status,
    200
  );
  const owner = await connect('owner', {
    exp: Math.floor(Date.now() / 1000) + 2,
  });
  owner.socket.send(
    JSON.stringify({ type: 'authenticate', token: ticket('join') })
  );
  await Bun.sleep(2200);
  assert.equal(
    owner.socket.readyState,
    WebSocket.OPEN,
    'refresh keeps programming socket alive'
  );
  assert.equal(
    owner.messages.filter((message) => message.type === 'sync').length,
    1,
    'refresh does not replay full project state'
  );
  const editor = await connect('editor');
  const viewer = await connect('viewer');
  owner.doc.getMap<Y.Text>('files').get('main.py')!.insert(0, '# owner\n');
  owner.update();
  editor.doc.getMap<Y.Text>('files').get('main.py')!.insert(0, '# editor\n');
  editor.update();
  await until(
    () =>
      programmingDocumentSnapshot(owner.doc).files[1]?.content ===
      programmingDocumentSnapshot(editor.doc).files[1]?.content,
    'concurrent edits converge'
  );
  assert.equal(
    (await request('checkpoint', 'POST', {}, ticket('checkpoint', 'editor')))
      .status,
    403
  );
  assert.equal((await request('checkpoint', 'POST', {})).status, 200);
  assert.equal(checkpoints.length, 1);
  assert.deepEqual(
    checkpoints[0]!.files.map((f) => f.path),
    ['main.py'],
    'unchanged file bytes never leave the worker'
  );
  assert.deepEqual(checkpoints[0]!.paths, ['keep.txt', 'main.py']);
  const content = checkpoints[0]!.files[0]!.content;
  assert(content.includes('# owner') && content.includes('# editor'));
  assert.equal((await request('checkpoint', 'POST', {})).status, 200);
  assert.equal(
    checkpoints.length,
    1,
    'unchanged checkpoints spend no callback bandwidth'
  );
  owner.socket.send(
    JSON.stringify({
      type: 'presence',
      presence: {
        file: 'main.py',
        cursor: { line: 1, column: 2 },
        selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 3 },
        pointer: { x: 0.25, y: 0.5 },
      },
    })
  );
  await until(
    () =>
      editor.messages.some(
        (m) => m.type === 'presence' && JSON.stringify(m).includes('"column":2')
      ),
    'cursor and pointer reach the other editor'
  );
  assert(
    editor.messages.some((message) =>
      JSON.stringify(message).includes('"endColumn":3')
    ),
    'selected range reaches the other editor'
  );
  viewer.update();
  await until(
    () => viewer.socket.readyState === WebSocket.CLOSED,
    'viewer update rejected'
  );
  const runId = randomUUID();
  const runnerId = randomUUID();
  const baseline = Object.fromEntries(
    programmingDocumentSnapshot(owner.doc).files.map((file) => [
      file.path,
      createHash('sha256').update(file.content).digest('hex'),
    ])
  );
  owner.doc.getMap<Y.Text>('files').set('notes.txt', new Y.Text('editor only'));
  owner.update();
  await until(
    () =>
      programmingDocumentSnapshot(editor.doc).files.some(
        (file) => file.path === 'notes.txt'
      ),
    'editor-only file is shared'
  );
  const exportBody = {
    revision,
    baseline,
    paths: ['main.py', 'generated.txt'],
    files: [{ path: 'generated.txt', content: 'runner output' }],
  };
  assert.equal(
    (
      await request(
        'runner-files',
        'POST',
        exportBody,
        ticket('runner-files', 'viewer', { runId, runnerId })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await request(
        'runner-files',
        'POST',
        exportBody,
        ticket('runner-files', 'owner', {
          runId,
          runnerId,
          ownerId: randomUUID(),
        })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await request(
        'runner-files',
        'POST',
        exportBody,
        ticket('runner-files', 'owner', { runId, runnerId })
      )
    ).status,
    200
  );
  await until(
    () =>
      programmingDocumentSnapshot(editor.doc).files.some(
        (file) => file.path === 'generated.txt'
      ),
    'runner output joins the same collaborative document'
  );
  assert.deepEqual(
    programmingDocumentSnapshot(editor.doc).files.map((file) => file.path),
    ['generated.txt', 'main.py', 'notes.txt']
  );
  const callbackCount = checkpoints.length;
  assert.equal(
    (
      await request(
        'runner-files',
        'POST',
        { ...exportBody, revision },
        ticket('runner-files', 'owner', { runId, runnerId })
      )
    ).status,
    200
  );
  assert.equal(
    checkpoints.length,
    callbackCount,
    'an acknowledged retry spends no Drive bandwidth'
  );
  owner.doc.getMap<Y.Text>('files').get('generated.txt')!.insert(0, 'editor ');
  owner.update();
  await until(
    () =>
      programmingDocumentSnapshot(editor.doc).files.find(
        (file) => file.path === 'generated.txt'
      )?.content === 'editor runner output',
    'new editor changes arrive'
  );
  assert.equal(
    (
      await request(
        'runner-files',
        'POST',
        {
          ...exportBody,
          revision,
          files: [
            { path: 'generated.txt', content: 'conflicting runner output' },
          ],
        },
        ticket('runner-files', 'owner', { runId, runnerId })
      )
    ).status,
    409
  );
  assert.equal(
    programmingDocumentSnapshot(editor.doc).files.find(
      (file) => file.path === 'generated.txt'
    )?.content,
    'editor runner output'
  );
  owner.doc.getMap<Y.Text>('files').set('../escape', new Y.Text('bad'));
  owner.update();
  await until(
    () => owner.socket.readyState === WebSocket.CLOSED,
    'invalid path rejected before room mutation'
  );
  const restored = await connect('owner');
  assert(
    !programmingDocumentSnapshot(restored.doc).files.some(
      (f) => f.path === '../escape'
    )
  );
  assert.equal(
    (
      await request(
        'seed',
        'GET',
        undefined,
        ticket('seed', 'owner', { ownerId: randomUUID() })
      )
    ).status,
    403
  );
  restored.socket.send(
    JSON.stringify({
      type: 'authenticate',
      token: ticket('join', 'owner', { userId: randomUUID() }),
    })
  );
  await until(
    () => restored.socket.readyState === WebSocket.CLOSED,
    'refresh cannot switch actors'
  );
  console.log(
    'Local Wrangler programming checks passed: auth, roles, concurrent edits, presence, delta checkpoints, no-op saves, selections, in-place refresh runner export merging/conflicts and invalid-update recovery.'
  );
} finally {
  for (const socket of sockets) socket.close();
  for (const doc of documents) doc.destroy();
  callback.stop(true);
}
