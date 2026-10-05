import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import SupabaseProvider, {
  SUPABASE_PROVIDER_SYNC_ORIGIN,
} from '../supabase-provider';

const realtimeMock = vi.hoisted(() => ({ channel: null as unknown }));
vi.mock('@tuturuuu/internal-api/realtime', () => ({
  createRealtimeClient: () => ({
    channel: () => realtimeMock.channel,
    removeChannel: vi.fn(),
  }),
}));

function createRealtimeChannel() {
  let subscribeHandler:
    | ((status: string, err?: { message?: string }) => void)
    | undefined;

  const channel = {
    on: vi.fn().mockImplementation(() => channel),
    send: vi.fn(),
    subscribe: vi.fn().mockImplementation((handler) => {
      subscribeHandler = handler;
      return channel;
    }),
    trigger(status: string, err?: { message?: string }) {
      subscribeHandler?.(status, err);
    },
  };

  realtimeMock.channel = channel;
  return channel;
}

describe('SupabaseProvider', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('broadcasts local edits and tracks synced state through save completion', async () => {
    const doc = new Y.Doc();
    const channel = createRealtimeChannel();
    const saveState = vi.fn().mockResolvedValue(undefined);
    const loadState = vi.fn().mockResolvedValue(null);
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as any;

    const provider = new SupabaseProvider(doc, supabase, {
      channel: 'task-editor-1',
      tableName: 'tasks',
      columnName: 'description_yjs_state',
      id: 'task-1',
      loadState,
      saveState,
      saveDebounceMs: 1000,
      resyncInterval: false,
    });

    channel.trigger('SUBSCRIBED');

    await waitFor(() => expect(provider.connected).toBe(true));
    expect(provider.synced).toBe(true);

    doc.getMap('prosemirror').set('text', 'hello');

    expect(provider.synced).toBe(false);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message',
        type: 'broadcast',
      })
    );

    await provider.flushSave();

    expect(saveState).toHaveBeenCalledTimes(1);
    expect(provider.synced).toBe(true);

    provider.destroy();
  });

  it('flushes pending debounced broadcasts before persisting', async () => {
    const doc = new Y.Doc();
    const channel = createRealtimeChannel();
    const saveState = vi.fn().mockResolvedValue(undefined);
    const loadState = vi.fn().mockResolvedValue(null);
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as any;

    const provider = new SupabaseProvider(doc, supabase, {
      channel: 'task-editor-2',
      tableName: 'tasks',
      columnName: 'description_yjs_state',
      id: 'task-2',
      loadState,
      saveState,
      saveDebounceMs: 1000,
      broadcastDebounceMs: 200,
      resyncInterval: false,
    });

    channel.trigger('SUBSCRIBED');

    await waitFor(() => {
      expect(provider.connected).toBe(true);
      expect(provider.synced).toBe(true);
    });

    const sendsBefore = channel.send.mock.calls.length;
    doc.getMap('prosemirror').set('text', 'hello');

    const pendingMessageSends = channel.send.mock.calls
      .slice(sendsBefore)
      .filter((call) => call?.[0]?.event === 'message');
    expect(pendingMessageSends).toHaveLength(0);

    await provider.flushSave();

    const flushedMessageSends = channel.send.mock.calls
      .slice(sendsBefore)
      .filter((call) => call?.[0]?.event === 'message');
    expect(flushedMessageSends.length).toBeGreaterThan(0);
    expect(saveState).toHaveBeenCalledTimes(1);

    provider.destroy();
  });

  it('coalesces debounced text insertion updates so peers receive additions', async () => {
    vi.useFakeTimers();

    const doc = new Y.Doc();
    const peerDoc = new Y.Doc();
    const channel = createRealtimeChannel();
    const saveState = vi.fn().mockResolvedValue(undefined);
    const loadState = vi.fn().mockResolvedValue(null);
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as any;

    const provider = new SupabaseProvider(doc, supabase, {
      channel: 'task-editor-debounced-insertions',
      tableName: 'tasks',
      columnName: 'description_yjs_state',
      id: 'task-debounced-insertions',
      loadState,
      saveState,
      saveDebounceMs: 1000,
      broadcastDebounceMs: 200,
      resyncInterval: false,
    });

    try {
      channel.trigger('SUBSCRIBED');

      await vi.advanceTimersByTimeAsync(0);
      expect(provider.connected).toBe(true);

      const sendsBefore = channel.send.mock.calls.length;
      const text = doc.getText('description');
      text.insert(0, 'a');
      text.insert(1, 'b');

      const pendingMessageSends = channel.send.mock.calls
        .slice(sendsBefore)
        .filter((call) => call?.[0]?.event === 'message');
      expect(pendingMessageSends).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(200);

      const messageSends = channel.send.mock.calls
        .slice(sendsBefore)
        .filter((call) => call?.[0]?.event === 'message');
      expect(messageSends).toHaveLength(1);

      const payload = messageSends[0]?.[0]?.payload as number[];
      Y.applyUpdate(peerDoc, Uint8Array.from(payload));
      expect(peerDoc.getText('description').toString()).toBe('ab');
    } finally {
      provider.destroy();
      vi.useRealTimers();
    }
  });

  it('coalesces debounced ProseMirror paragraph updates so peers receive new lines', async () => {
    vi.useFakeTimers();

    const doc = new Y.Doc();
    const peerDoc = new Y.Doc();
    const channel = createRealtimeChannel();
    const saveState = vi.fn().mockResolvedValue(undefined);
    const loadState = vi.fn().mockResolvedValue(null);
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as any;

    const provider = new SupabaseProvider(doc, supabase, {
      channel: 'task-editor-debounced-paragraphs',
      tableName: 'tasks',
      columnName: 'description_yjs_state',
      id: 'task-debounced-paragraphs',
      loadState,
      saveState,
      saveDebounceMs: 1000,
      broadcastDebounceMs: 200,
      resyncInterval: false,
    });

    try {
      channel.trigger('SUBSCRIBED');

      await vi.advanceTimersByTimeAsync(0);
      expect(provider.connected).toBe(true);

      const sendsBefore = channel.send.mock.calls.length;
      const fragment = doc.getXmlFragment('prosemirror');
      const firstParagraph = new Y.XmlElement('paragraph');
      const firstText = new Y.XmlText();
      const secondParagraph = new Y.XmlElement('paragraph');
      const secondText = new Y.XmlText();

      firstParagraph.insert(0, [firstText]);
      fragment.insert(0, [firstParagraph]);
      firstText.insert(0, 'First line');
      secondParagraph.insert(0, [secondText]);
      fragment.insert(1, [secondParagraph]);
      secondText.insert(0, 'Second line');

      const pendingMessageSends = channel.send.mock.calls
        .slice(sendsBefore)
        .filter((call) => call?.[0]?.event === 'message');
      expect(pendingMessageSends).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(200);

      const messageSends = channel.send.mock.calls
        .slice(sendsBefore)
        .filter((call) => call?.[0]?.event === 'message');
      expect(messageSends).toHaveLength(1);

      const payload = messageSends[0]?.[0]?.payload as number[];
      Y.applyUpdate(peerDoc, Uint8Array.from(payload));
      expect(peerDoc.getXmlFragment('prosemirror').toString()).toBe(
        '<paragraph>First line</paragraph><paragraph>Second line</paragraph>'
      );
    } finally {
      provider.destroy();
      vi.useRealTimers();
    }
  });

  it('keeps the document unsynced when a custom save callback reports failure', async () => {
    const doc = new Y.Doc();
    const channel = createRealtimeChannel();
    const saveState = vi.fn().mockResolvedValue(false);
    const loadState = vi.fn().mockResolvedValue(null);
    const errorListener = vi.fn();
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as any;

    const provider = new SupabaseProvider(doc, supabase, {
      channel: 'task-editor-failed-save',
      tableName: 'tasks',
      columnName: 'description_yjs_state',
      id: 'task-failed-save',
      loadState,
      saveState,
      saveDebounceMs: 1000,
      resyncInterval: false,
    });
    provider.on('error', errorListener);

    channel.trigger('SUBSCRIBED');

    await waitFor(() => {
      expect(provider.connected).toBe(true);
      expect(provider.synced).toBe(true);
    });

    doc.getMap('prosemirror').set('text', 'unsaved');
    expect(provider.synced).toBe(false);

    await provider.flushSave();

    expect(saveState).toHaveBeenCalledTimes(1);
    expect(provider.synced).toBe(false);
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SAVE_FAILED',
      })
    );

    provider.destroy();
  });

  it('does not broadcast or persist hydration-origin document updates', async () => {
    const doc = new Y.Doc();
    const channel = createRealtimeChannel();
    const saveState = vi.fn().mockResolvedValue(undefined);
    const loadState = vi.fn().mockResolvedValue(null);
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as any;

    const provider = new SupabaseProvider(doc, supabase, {
      channel: 'task-editor-hydration',
      tableName: 'tasks',
      columnName: 'description_yjs_state',
      id: 'task-hydration',
      loadState,
      saveState,
      saveDebounceMs: 1000,
      resyncInterval: false,
    });

    channel.trigger('SUBSCRIBED');

    await waitFor(() => {
      expect(provider.connected).toBe(true);
      expect(provider.synced).toBe(true);
    });

    const sendsBefore = channel.send.mock.calls.length;
    doc.transact(() => {
      doc.getMap('prosemirror').set('text', 'hydrated');
    }, SUPABASE_PROVIDER_SYNC_ORIGIN);

    expect(provider.synced).toBe(true);
    expect(channel.send.mock.calls).toHaveLength(sendsBefore);

    await provider.flushSave();

    expect(saveState).not.toHaveBeenCalled();

    provider.destroy();
  });
});

describe('durable hydration without peer transport', () => {
  it('loads saved content even when the channel never subscribes', async () => {
    createRealtimeChannel();
    const saved = new Y.Doc();
    saved.getText('description').insert(0, 'saved text');
    const doc = new Y.Doc();
    const provider = new SupabaseProvider(doc, {} as any, {
      channel: 'task-editor-offline',
      tableName: 'tasks',
      columnName: 'state',
      id: 'offline',
      loadState: async () => Array.from(Y.encodeStateAsUpdate(saved)),
      resyncInterval: false,
    });
    await waitFor(() => expect(provider.hydrated).toBe(true));
    expect(doc.getText('description').toString()).toBe('saved text');
    expect(provider.connected).toBe(false);
    expect(provider.synced).toBe(false);
    provider.destroy();
    saved.destroy();
  });

  it('coalesces startup and connection loads and ignores disconnect during hydration', async () => {
    const channel = createRealtimeChannel();
    let finish!: (state: number[] | null) => void;
    const loadState = vi.fn(
      () =>
        new Promise<number[] | null>((resolve) => {
          finish = resolve;
        })
    );
    const provider = new SupabaseProvider(new Y.Doc(), {} as any, {
      channel: 'task-editor-pending',
      tableName: 'tasks',
      columnName: 'state',
      id: 'pending',
      loadState,
      resyncInterval: false,
    });
    channel.trigger('SUBSCRIBED');
    channel.trigger('CLOSED');
    finish(null);
    await waitFor(() => expect(provider.hydrated).toBe(true));
    expect(loadState).toHaveBeenCalledTimes(1);
    expect(provider.connected).toBe(false);
    provider.destroy();
  });

  it('does not hydrate a denied read and retries without unhandled rejection', async () => {
    const channel = createRealtimeChannel();
    const loadState = vi
      .fn()
      .mockRejectedValueOnce(new Error('Access denied'))
      .mockResolvedValueOnce(null);
    const provider = new SupabaseProvider(new Y.Doc(), {} as any, {
      channel: 'task-editor-denied',
      tableName: 'tasks',
      columnName: 'state',
      id: 'denied',
      loadState,
      resyncInterval: false,
    });
    const report = vi.fn();
    provider.on('error', report);
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(provider.hydrated).toBe(false);
    channel.trigger('SUBSCRIBED');
    await waitFor(() => expect(provider.connected).toBe(true));
    expect(provider.hydrated).toBe(true);
    provider.destroy();
  });

  it('ignores a durable read completing after teardown', async () => {
    createRealtimeChannel();
    let finish!: (state: number[] | null) => void;
    const doc = new Y.Doc();
    const provider = new SupabaseProvider(doc, {} as any, {
      channel: 'task-editor-old',
      tableName: 'tasks',
      columnName: 'state',
      id: 'old',
      loadState: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      resyncInterval: false,
    });
    const apply = vi.fn();
    doc.on('update', apply);
    provider.destroy();
    finish(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.hydrated).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
