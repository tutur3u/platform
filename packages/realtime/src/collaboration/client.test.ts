import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ProgrammingCollaborationClient } from './client';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  sent: string[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  constructor(readonly url: URL) {
    Socket.instances.push(this);
  }
  send(value: string) {
    this.sent.push(value);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  sync(doc: Y.Doc) {
    this.onmessage?.({
      data: JSON.stringify({
        type: 'sync',
        update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        stateVector: Buffer.from(Y.encodeStateVector(doc)).toString('base64'),
      }),
    });
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('refreshes the current programming socket without resending a full document', () => {
  const client = new ProgrammingCollaborationClient(vi.fn());
  const server = new Y.Doc();
  try {
    client.connect('wss://example.com/collaboration', 'first');
    const socket = Socket.instances[0]!;
    socket.sync(server);
    client.connect('wss://example.com/collaboration', 'renewed');
    expect(Socket.instances).toHaveLength(1);
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'authenticate', token: 'renewed' },
    ]);
    expect(socket.readyState).toBe(Socket.OPEN);
  } finally {
    client.destroy();
    server.destroy();
  }
});
it('retains local edits while offline and flushes them after reconnect sync', async () => {
  const client = new ProgrammingCollaborationClient(vi.fn());
  const server = new Y.Doc();
  try {
    client.connect('wss://example.com/collaboration', 'first');
    Socket.instances[0]!.sync(server);
    Socket.instances[0]!.close();
    client.doc.getText('code').insert(0, 'offline');
    await vi.advanceTimersByTimeAsync(1000);
    const socket = Socket.instances.at(-1)!;
    socket.sync(server);
    const update = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === 'update');
    Y.applyUpdate(server, Buffer.from(update.update, 'base64'));
    expect(server.getText('code').toString()).toBe('offline');
    client.destroy();
    const count = Socket.instances.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(Socket.instances).toHaveLength(count);
  } finally {
    client.destroy();
    server.destroy();
  }
});
it('refuses to expose a join capability to an insecure external endpoint', () => {
  const client = new ProgrammingCollaborationClient(vi.fn());
  expect(() =>
    client.connect('ws://evil.example/collaboration', 'secret')
  ).toThrow('Invalid collaboration endpoint');
  expect(Socket.instances).toHaveLength(0);
  client.destroy();
});

it('reports local file edits but not the run command or updates from the room', () => {
  const client = new ProgrammingCollaborationClient(vi.fn());
  const edits = vi.fn();
  const stop = client.onLocalEdit(edits);
  try {
    client.connect('wss://example.com/collaboration', 'ticket');
    const socket = Socket.instances[0]!;
    const remote = new Y.Doc();
    const file = new Y.Text('int a;');
    remote.getMap<Y.Text>('files').set('main.c', file);
    socket.sync(remote);
    expect(edits).not.toHaveBeenCalled();
    const next = new Y.Doc();
    Y.applyUpdate(next, Y.encodeStateAsUpdate(remote));
    next.getMap<Y.Text>('files').get('main.c')!.insert(6, ' int b;');
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        update: Buffer.from(Y.encodeStateAsUpdate(next)).toString('base64'),
      }),
    });
    expect(client.doc.getMap<Y.Text>('files').get('main.c')!.toString()).toBe(
      'int a; int b;'
    );
    expect(edits).not.toHaveBeenCalled();
    client.doc.getText('command').insert(0, 'ls');
    expect(edits).not.toHaveBeenCalled();
    client.doc.getMap<Y.Text>('files').get('main.c')!.insert(0, 'x');
    expect(edits).toHaveBeenCalledTimes(1);
    stop();
    client.doc.getMap<Y.Text>('files').get('main.c')!.insert(0, 'y');
    expect(edits).toHaveBeenCalledTimes(1);
  } finally {
    client.destroy();
  }
});
