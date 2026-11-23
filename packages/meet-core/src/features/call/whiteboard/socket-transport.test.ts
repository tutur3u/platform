import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardSocketTransport } from './socket-transport';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols: string[] = []
  ) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const session = (token = 't1') => ({
  endpoint: 'wss://rt.example.invalid/whiteboard',
  token,
  role: 'edit' as const,
  refreshSeconds: 60,
});
const rect = { id: 'a', type: 'rectangle', version: 1, versionNonce: 1 };

function setup(join = vi.fn(async () => session())) {
  const calls = {
    role: vi.fn(),
    closed: vi.fn(),
    elements: vi.fn(),
    status: vi.fn(),
  };
  const transport = createBoardSocketTransport({
    join,
    onRole: calls.role,
    onClosed: calls.closed,
    createSocket: (url, protocols) =>
      new FakeSocket(url, protocols) as unknown as WebSocket,
    retryDelaysMs: [100, 200],
  });
  const disconnect = transport.connect({
    user: { id: 'u', displayName: 'U' },
    onStatus: calls.status,
    onElementChanges: calls.elements,
    onCursor: vi.fn(),
    onSelection: vi.fn(),
  });
  return { transport, disconnect, calls, join };
}
const tick = () => vi.advanceTimersByTimeAsync(0);

describe('board socket transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
  });
  afterEach(() => vi.useRealTimers());

  it('connects with the ticket in the query and applies the scene', async () => {
    const { calls } = setup();
    await tick();
    const socket = FakeSocket.all[0]!;
    expect(socket.url).toBe('wss://rt.example.invalid/whiteboard');
    expect(socket.protocols).toEqual(['tuturuuu.whiteboard', 'bearer.t1']);
    socket.open();
    expect(calls.status).toHaveBeenLastCalledWith('connected');
    socket.receive({
      type: 'sync',
      elements: [rect],
      chunk: 0,
      chunks: 1,
      role: 'view',
    });
    expect(calls.role).toHaveBeenLastCalledWith('view');
    expect(calls.elements.mock.calls[0]![0].changes[0]).toEqual({
      type: 'insert',
      element: rect,
    });
  });

  it('reports edits the room refused', async () => {
    const onRejected = vi.fn();
    const transport = createBoardSocketTransport({
      join: async () => session(),
      onRole: vi.fn(),
      onClosed: vi.fn(),
      onRejected,
      createSocket: (url, protocols) =>
        new FakeSocket(url, protocols) as unknown as WebSocket,
    });
    transport.connect({
      user: { id: 'u', displayName: 'U' },
      onStatus: vi.fn(),
      onElementChanges: vi.fn(),
      onCursor: vi.fn(),
      onSelection: vi.fn(),
    });
    await tick();
    const socket = FakeSocket.all.at(-1)!;
    socket.open();
    socket.receive({ type: 'rejected', reason: 'size' });
    expect(onRejected).toHaveBeenCalledWith('size');
  });

  it('sends batches only while open and reports offline sends', async () => {
    const { transport } = setup();
    await tick();
    const socket = FakeSocket.all[0]!;
    await expect(
      transport.sendElementChanges({ senderId: 'u', changes: [], timestamp: 1 })
    ).rejects.toThrow('offline');
    socket.open();
    await transport.sendElementChanges({
      senderId: 'u',
      changes: [{ type: 'insert', element: rect as never }],
      timestamp: 1,
    });
    expect(socket.sent[0].type).toBe('elements');
  });

  it('refreshes its ticket on schedule', async () => {
    const join = vi.fn(async () => session('fresh'));
    setup(join);
    await tick();
    FakeSocket.all[0]!.open();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all[0]!.sent).toContainEqual({
      type: 'authenticate',
      token: 'fresh',
    });
  });

  it('reconnects a bounded number of times, then reports an error', async () => {
    const { calls } = setup();
    await tick();
    FakeSocket.all[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    FakeSocket.all[1]!.drop();
    await vi.advanceTimersByTimeAsync(200);
    FakeSocket.all[2]!.drop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(3);
    expect(calls.status).toHaveBeenLastCalledWith('error', expect.any(Error));
  });

  it('treats a refused ticket as final and a closed message as final', async () => {
    const refused = vi.fn(async () => {
      throw Object.assign(new Error('no'), { status: 403 });
    });
    const first = setup(refused);
    await tick();
    expect(first.calls.closed).toHaveBeenCalledTimes(1);
    expect(FakeSocket.all).toHaveLength(0);

    const { calls } = setup();
    await tick();
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.receive({ type: 'closed' });
    expect(calls.closed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('stops everything on disconnect', async () => {
    const { disconnect } = setup();
    await tick();
    FakeSocket.all[0]!.open();
    disconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.all[0]!.sent).toEqual([]);
  });
});
