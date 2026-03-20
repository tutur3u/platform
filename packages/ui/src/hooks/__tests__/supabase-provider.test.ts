import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import SupabaseProvider from '../supabase-provider';

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
});
