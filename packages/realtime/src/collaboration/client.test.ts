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
