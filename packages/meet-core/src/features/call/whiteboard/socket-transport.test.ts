import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardSocketTransport } from './socket-transport';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event?: { code?: number; reason?: string }) => void) | null =
    null;
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
  drop(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
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

  it('holds back a line until it has a second point', async () => {
    const { transport } = setup();
    await tick();
    const socket = FakeSocket.all[0]!;
    socket.open();
    const line = (count: number) => ({
      id: 'l',
      type: 'line',
      version: count,
      versionNonce: 1,
      points: Array.from({ length: count }, (_, i) => [i, i]),
    });
    const send = (elements: object[]) =>
      transport.sendElementChanges({
        senderId: 'u',
        changes: elements.map((element) => ({
          type: 'update',
          element: element as never,
        })),
        timestamp: 1,
      });
    // Pointer-down adds a one-point line; nothing goes out for it alone.
    await send([line(1)]);
    expect(socket.sent).toHaveLength(0);
    await send([line(1), rect]);
    expect(socket.sent[0].changes.map((c: any) => c.element.id)).toEqual(['a']);
    await send([line(2)]);
    expect(socket.sent[1].changes[0].element.points).toHaveLength(2);
  });

  it('always sends deletions and lines the board already knows', async () => {
    const { transport } = setup();
    await tick();
    const socket = FakeSocket.all[0]!;
    socket.open();
    const line = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      type: 'line',
      version: 2,
      versionNonce: 1,
      points: [[0, 0]],
      ...over,
    });
    const send = (type: string, element: object) =>
      transport.sendElementChanges({
        senderId: 'u',
        changes: [{ type: type as never, element: element as never }],
        timestamp: 1,
      });
    const sentIds = () =>
      socket.sent.flatMap((m) => m.changes.map((c: any) => c.element.id));
    // A new one-point line that is deleted, either way, still goes out.
    await send('update', line('gone', { isDeleted: true }));
    await send('delete', line('dropped'));
    // A line sent with two points that loses one keeps reaching the board.
    await send(
      'update',
      line('mine', {
        points: [
          [0, 0],
          [5, 5],
        ],
      })
    );
    await send('update', line('mine', { version: 3 }));
    // So does a line another person drew.
    socket.receive({
      type: 'elements',
      senderId: 'peer',
      timestamp: 1,
      changes: [{ type: 'insert', element: line('theirs', { version: 1 }) }],
    });
    await send('update', line('theirs'));
    expect(sentIds()).toEqual(['gone', 'dropped', 'mine', 'mine', 'theirs']);
  });

  it('forgets lines it sent once the socket closes or refuses', async () => {
    const { transport } = setup();
    await tick();
    const first = FakeSocket.all[0]!;
    const line = (version: number, count: number) => ({
      id: 'l',
      type: 'line',
      version,
      versionNonce: 1,
      points: Array.from({ length: count }, (_, i) => [i, i]),
    });
    const send = (element: object) =>
      transport.sendElementChanges({
        senderId: 'u',
        changes: [{ type: 'update', element: element as never }],
        timestamp: 1,
      });
    // Offline: the send is refused, so the line never becomes known.
    await expect(send(line(1, 2))).rejects.toThrow('offline');
    first.open();
    await send(line(2, 1));
    expect(first.sent).toHaveLength(0);
    await send(line(3, 2));
    expect(first.sent).toHaveLength(1);
    // The room may never have received it; after a reconnect with no sync
    // naming it, a one-point copy is a new line again.
    first.drop();
    await vi.advanceTimersByTimeAsync(100);
    const second = FakeSocket.all.at(-1)!;
    expect(second).not.toBe(first);
    second.open();
    await send(line(4, 1));
    expect(second.sent).toHaveLength(0);
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

  it('reports a socket the browser refuses to open instead of staying silent', async () => {
    const status = vi.fn();
    const onFailed = vi.fn();
    const transport = createBoardSocketTransport({
      join: async () => session(),
      onRole: vi.fn(),
      onClosed: vi.fn(),
      onFailed,
      createSocket: () => {
        throw new SyntaxError('The subprotocol is invalid');
      },
      retryDelaysMs: [100],
    });
    transport.connect({
      user: { id: 'u', displayName: 'U' },
      onStatus: status,
      onElementChanges: vi.fn(),
      onCursor: vi.fn(),
      onSelection: vi.fn(),
    });
    await tick();
    expect(onFailed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(status).toHaveBeenLastCalledWith('error', expect.any(SyntaxError));
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('tells the board when every reconnect attempt failed', async () => {
    const onFailed = vi.fn();
    const transport = createBoardSocketTransport({
      join: async () => session(),
      onRole: vi.fn(),
      onClosed: vi.fn(),
      onFailed,
      createSocket: (url, protocols) =>
        new FakeSocket(url, protocols) as unknown as WebSocket,
      retryDelaysMs: [100],
    });
    transport.connect({
      user: { id: 'u', displayName: 'U' },
      onStatus: vi.fn(),
      onElementChanges: vi.fn(),
      onCursor: vi.fn(),
      onSelection: vi.fn(),
    });
    await tick();
    FakeSocket.all[0]!.drop();
    await vi.advanceTimersByTimeAsync(100);
    FakeSocket.all[1]!.drop();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  describe('a view-only session', () => {
    const insert = (transport: ReturnType<typeof setup>['transport']) =>
      transport.sendElementChanges({
        senderId: 'u',
        changes: [{ type: 'update', element: rect as never }],
        timestamp: 1,
      });
    const viewTicket = (token = 't1') => ({
      ...session(token),
      role: 'view' as const,
    });

    it('never sends element writes on a view-only ticket', async () => {
      const { transport, calls } = setup(vi.fn(async () => viewTicket()));
      await tick();
      const socket = FakeSocket.all[0]!;
      socket.open();
      // Dropped, not refused: the editor has nothing to queue and replay.
      await expect(insert(transport)).resolves.toBeUndefined();
      expect(socket.sent).toEqual([]);
      expect(calls.role).toHaveBeenLastCalledWith('view');
    });

    it('follows the role the room honours over the ticket', async () => {
      const { transport } = setup();
      await tick();
      const socket = FakeSocket.all[0]!;
      socket.open();
      socket.receive({
        type: 'sync',
        elements: [],
        chunk: 0,
        chunks: 1,
        role: 'view',
      });
      await insert(transport);
      expect(socket.sent).toEqual([]);
      socket.receive({ type: 'role', role: 'edit' });
      await insert(transport);
      expect(socket.sent.map((message) => message.type)).toEqual(['elements']);
    });

    it('stays view-only after a read-only close and drops pending writes', async () => {
      const join = vi.fn(async () => session(`t${join.mock.calls.length}`));
      const { transport, calls } = setup(join);
      await tick();
      const first = FakeSocket.all[0]!;
      first.open();
      await insert(transport);
      expect(first.sent).toHaveLength(1);
      first.drop(1008, 'Read-only board');
      expect(calls.role).toHaveBeenLastCalledWith('view');
      await vi.advanceTimersByTimeAsync(100);
      // One fresh ticket; the edit ticket does not lift the fence.
      expect(join).toHaveBeenCalledTimes(2);
      const second = FakeSocket.all.at(-1)!;
      expect(second).not.toBe(first);
      second.open();
      await insert(transport);
      expect(second.sent).toEqual([]);
      expect(calls.role).toHaveBeenLastCalledWith('view');
      // The room itself saying edit lifts it.
      second.receive({ type: 'role', role: 'edit' });
      await insert(transport);
      expect(second.sent).toHaveLength(1);
    });

    it('stops instead of looping when the room refuses again', async () => {
      const join = vi.fn(async () => session());
      const onFailed = vi.fn();
      const transport = createBoardSocketTransport({
        join,
        onRole: vi.fn(),
        onClosed: vi.fn(),
        onFailed,
        createSocket: (url, protocols) =>
          new FakeSocket(url, protocols) as unknown as WebSocket,
        retryDelaysMs: [100, 200, 400],
      });
      transport.connect({
        user: { id: 'u', displayName: 'U' },
        onStatus: vi.fn(),
        onElementChanges: vi.fn(),
        onCursor: vi.fn(),
        onSelection: vi.fn(),
      });
      await tick();
      FakeSocket.all.at(-1)!.open();
      FakeSocket.all.at(-1)!.drop(1008, 'Read-only board');
      await vi.advanceTimersByTimeAsync(100);
      FakeSocket.all.at(-1)!.open();
      FakeSocket.all.at(-1)!.drop(1008, 'Read-only board');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(join).toHaveBeenCalledTimes(2);
      expect(onFailed).toHaveBeenCalledOnce();
    });

    it('reconnects normally after another policy close', async () => {
      const { transport, join } = setup();
      await tick();
      FakeSocket.all[0]!.open();
      FakeSocket.all[0]!.drop(1008, 'Ticket expired');
      await vi.advanceTimersByTimeAsync(100);
      expect(join).toHaveBeenCalledTimes(2);
      const second = FakeSocket.all.at(-1)!;
      second.open();
      await insert(transport);
      expect(second.sent).toHaveLength(1);
    });
  });
});
