import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import SupabaseProvider, {
  SUPABASE_PROVIDER_SYNC_ORIGIN,
} from '../supabase-provider';

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

    await Promise.resolve();
    await Promise.resolve();
    expect(provider.connected).toBe(true);
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

      await Promise.resolve();
      await Promise.resolve();
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
