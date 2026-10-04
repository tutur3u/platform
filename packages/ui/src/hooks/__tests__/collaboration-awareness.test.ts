import { afterEach, describe, expect, it, vi } from 'vitest';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import SupabaseProvider from '../supabase-provider';

vi.mock('@tuturuuu/internal-api/realtime', () => ({
  createRealtimeClient: () => {
    const channel = {
      on: () => channel,
      subscribe: () => channel,
      send: vi.fn(),
    };
    return { channel: () => channel, removeChannel: vi.fn() };
  },
}));
afterEach(() => vi.useRealTimers());
describe('collaboration cursor batching', () => {
  it('merges all changed client IDs and flushes during continuous updates', async () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const provider = new SupabaseProvider(
      doc,
      {} as ConstructorParameters<typeof SupabaseProvider>[1],
      {
        channel: 'task-editor-fixture',
        id: 'fixture',
        tableName: 'tasks',
        columnName: 'description_yjs_state',
        loadState: async () => null,
        saveState: async () => true,
        resyncInterval: false,
      }
    );
    const a = new Y.Doc();
    const b = new Y.Doc();
    const first = new awarenessProtocol.Awareness(a);
    const second = new awarenessProtocol.Awareness(b);
    first.setLocalState({ user: { id: 'a' }, cursor: 1 });
    second.setLocalState({ user: { id: 'b' }, cursor: 2 });
    const sent = vi.fn();
    provider.on('awareness', sent);
    awarenessProtocol.applyAwarenessUpdate(
      provider.awareness,
      awarenessProtocol.encodeAwarenessUpdate(first, [a.clientID]),
      'local-fixture'
    );
    await vi.advanceTimersByTimeAsync(100);
    awarenessProtocol.applyAwarenessUpdate(
      provider.awareness,
      awarenessProtocol.encodeAwarenessUpdate(second, [b.clientID]),
      'local-fixture'
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(sent).toHaveBeenCalledOnce();
    const receiverDoc = new Y.Doc();
    const receiver = new awarenessProtocol.Awareness(receiverDoc);
    awarenessProtocol.applyAwarenessUpdate(
      receiver,
      sent.mock.calls[0]![0],
      'fixture'
    );
    expect(receiver.getStates().get(a.clientID)).toMatchObject({ cursor: 1 });
    expect(receiver.getStates().get(b.clientID)).toMatchObject({ cursor: 2 });
    provider.destroy();
    provider.awareness.destroy();
    first.destroy();
    second.destroy();
    receiver.destroy();
    for (const d of [doc, a, b, receiverDoc]) d.destroy();
  });
  it('does not rebroadcast peer awareness back to the room', async () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const peerDoc = new Y.Doc();
    const provider = new SupabaseProvider(
      doc,
      {} as ConstructorParameters<typeof SupabaseProvider>[1],
      {
        channel: 'task-editor-fixture',
        id: 'fixture',
        tableName: 'tasks',
        columnName: 'description_yjs_state',
        loadState: async () => null,
        saveState: async () => true,
        resyncInterval: false,
      }
    );
    const peer = new awarenessProtocol.Awareness(peerDoc);
    peer.setLocalState({ cursor: 4 });
    const sent = vi.fn();
    provider.on('awareness', sent);
    provider.onAwareness(
      awarenessProtocol.encodeAwarenessUpdate(peer, [peerDoc.clientID])
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).not.toHaveBeenCalled();
    expect(provider.awareness.getStates().get(peerDoc.clientID)).toMatchObject({
      cursor: 4,
    });
    provider.destroy();
    provider.awareness.destroy();
    peer.destroy();
    doc.destroy();
    peerDoc.destroy();
  });
});
