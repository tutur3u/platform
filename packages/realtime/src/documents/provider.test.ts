import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { RealtimeChannel } from '../channels';
import { CloudflareDocumentProvider } from './provider';

type Message = { type: 'broadcast'; event: string; payload: unknown };
class Room {
  readonly document = new Y.Doc();
  peers: Peer[] = [];
  peer() {
    const peer = new Peer(this);
    this.peers.push(peer);
    return peer;
  }
  deliver(message: Message, sender: Peer) {
    if (message.event === 'message') {
      Y.applyUpdate(
        this.document,
        Uint8Array.from(message.payload as number[])
      );
    }
    for (const peer of this.peers)
      if (peer !== sender && peer.connected) peer.receive(message);
  }
}
class Peer {
  connected = false;
  sent: Message[] = [];
  listeners = new Map<string, (message: { payload: unknown }) => void>();
  status?: (status: string) => void;
  constructor(readonly room: Room) {}
  on(
    _type: string,
    filter: { event: string },
    callback: (message: { payload: unknown }) => void
  ) {
    this.listeners.set(filter.event, callback);
    return this;
  }
  subscribe(callback: (status: string) => void) {
    this.status = callback;
    return this;
  }
  reconnect() {
    this.connected = true;
    this.receive({
      type: 'broadcast',
      event: 'message',
      payload: Array.from(Y.encodeStateAsUpdate(this.room.document)),
    });
    this.status?.('SUBSCRIBED');
  }
  disconnect() {
    this.connected = false;
    this.status?.('CLOSED');
  }
  receive(message: Message) {
    this.listeners.get(message.event)?.({ payload: message.payload });
  }
  async send(message: Message) {
    if (!this.connected) throw new Error('Disconnected');
    this.sent.push(message);
    this.room.deliver(message, this);
    return 'ok';
  }
  async unsubscribe() {
    this.disconnect();
    return 'ok';
  }
}
describe('shared Cloudflare document provider', () => {
  let room: Room;
  const providers: CloudflareDocumentProvider[] = [];
  const documents: Y.Doc[] = [];
  function editor() {
    const peer = room.peer();
    const doc = new Y.Doc();
    documents.push(doc);
    const status = vi.fn();
    const checkpoint = vi.fn();
    const provider = new CloudflareDocumentProvider(
      doc,
      peer as unknown as RealtimeChannel,
      status,
      checkpoint
    );
    providers.push(provider);
    peer.reconnect();
    return { peer, doc, provider, status, checkpoint };
  }
  beforeEach(() => {
    vi.useFakeTimers();
    room = new Room();
  });
  afterEach(async () => {
    for (const provider of providers.splice(0)) await provider.destroy();
    for (const doc of documents.splice(0)) doc.destroy();
    room.document.destroy();
    vi.useRealTimers();
  });
  it('reports validated checkpoint status and ignores malformed or late notifications', async () => {
    const first = editor();
    const notify = (payload: unknown) =>
      first.peer.receive({
        type: 'broadcast',
        event: 'document-checkpoint',
        payload,
      });
    notify({ status: 'conflict', version: 2 });
    expect(first.checkpoint).toHaveBeenLastCalledWith('conflict');
    notify({ status: 'saved', version: -1 });
    notify({ status: 'unknown', version: 3 });
    expect(first.checkpoint).toHaveBeenCalledTimes(1);
    notify({ status: 'deferred', version: 3 });
    notify({ status: 'saved', version: 4 });
    expect(first.checkpoint).toHaveBeenLastCalledWith('saved');
    await first.provider.destroy();
    notify({ status: 'conflict', version: 5 });
    expect(first.checkpoint).toHaveBeenCalledTimes(3);
  });
  it('batches simultaneous edits and remote updates do not echo', async () => {
    const first = editor();
    const second = editor();
    await vi.advanceTimersByTimeAsync(50);
    first.peer.sent = [];
    second.peer.sent = [];
    first.doc.getText('shared').insert(0, 'web');
    second.doc.getText('shared').insert(0, 'mobile');
    expect(first.peer.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(50);
    expect(first.doc.getText('shared').toString()).toBe(
      second.doc.getText('shared').toString()
    );
    expect(room.document.getText('shared').toString()).toContain('web');
    expect(room.document.getText('shared').toString()).toContain('mobile');
    expect(
      first.peer.sent.filter((message) => message.event === 'message')
    ).toHaveLength(1);
    expect(
      second.peer.sent.filter((message) => message.event === 'message')
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(
      first.peer.sent.filter((message) => message.event === 'message')
    ).toHaveLength(1);
  });
  it('reconciles offline edits with remote edits on actual reconnect', async () => {
    const first = editor();
    const second = editor();
    await vi.advanceTimersByTimeAsync(50);
    first.peer.disconnect();
    first.doc.getText('shared').insert(0, 'offline');
    second.doc.getText('shared').insert(0, 'online');
    await vi.advanceTimersByTimeAsync(50);
    expect(first.status).toHaveBeenLastCalledWith(false);
    first.peer.reconnect();
    await vi.advanceTimersByTimeAsync(50);
    expect(first.doc.getText('shared').toString()).toBe(
      second.doc.getText('shared').toString()
    );
    expect(room.document.getText('shared').toString()).toContain('offline');
    expect(room.document.getText('shared').toString()).toContain('online');
    expect(first.status).toHaveBeenLastCalledWith(true);
  });
  it('shares selections, removes departing awareness and ignores malformed bytes', async () => {
    const first = editor();
    const second = editor();
    first.provider.awareness.setLocalState({
      user: { id: 'actor' },
      selection: { anchor: 1, head: 4 },
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(
      second.provider.awareness.getStates().get(first.doc.clientID)?.selection
    ).toEqual({ anchor: 1, head: 4 });
    second.peer.receive({
      type: 'broadcast',
      event: 'message',
      payload: [999],
    });
    second.peer.receive({
      type: 'broadcast',
      event: 'awareness',
      payload: 'invalid',
    });
    await first.provider.destroy();
    expect(second.provider.awareness.getStates().has(first.doc.clientID)).toBe(
      false
    );
    const count = first.peer.sent.length;
    first.doc.getText('shared').insert(0, 'late');
    await vi.advanceTimersByTimeAsync(100);
    expect(first.peer.sent).toHaveLength(count);
  });
});
