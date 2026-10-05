import { act, renderHook } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useYjsCollaboration } from '../use-yjs-collaboration';

const instances = vi.hoisted(
  () =>
    [] as {
      id: number;
      destroyed: boolean;
      emit: (event: string, value: unknown) => void;
    }[]
);
vi.mock('@tuturuuu/supabase/next/client', () => ({ createClient: () => ({}) }));
vi.mock('@tuturuuu/ui/hooks/supabase-provider', () => ({
  default: class {
    id: number;
    destroyed = false;
    hydrated = false;
    awareness: { destroy: () => void };
    private listeners = new Map<string, (value: unknown) => void>();
    constructor(
      private doc: { clientID: number; destroy: () => void },
      _client: unknown,
      config: { awareness: { destroy: () => void } }
    ) {
      this.id = doc.clientID;
      this.awareness = config.awareness;
      instances.push(this);
    }
    on(event: string, callback: (value: unknown) => void) {
      this.listeners.set(event, callback);
    }
    emit(event: string, value: unknown) {
      if (event === 'hydrated') this.hydrated = true;
      this.listeners.get(event)?.(value);
    }
    destroy() {
      this.destroyed = true;
      this.awareness.destroy();
      this.doc.destroy();
    }
  },
}));
const user = { id: 'actor', name: 'Ada', color: '#123456' };
const config = {
  channel: 'task-editor-one',
  tableName: 'tasks',
  columnName: 'description_yjs_state',
  id: 'one',
  user,
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);
describe('collaboration hook lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    instances.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('does not start awareness before authentication and reuses StrictMode providers', async () => {
    const { result, rerender, unmount } = renderHook(
      (actor) => useYjsCollaboration({ ...config, user: actor }),
      { wrapper, initialProps: null as typeof user | null }
    );
    expect(result.current.doc).toBeNull();
    expect(result.current.awareness).toBeNull();
    expect(instances).toHaveLength(0);
    rerender(user);
    expect(instances).toHaveLength(1);
    const provider = result.current.provider;
    expect(provider).not.toBeNull();
    rerender({ ...user, name: 'Ada updated' });
    expect(result.current.provider).toBe(provider);
    expect(result.current.awareness?.getLocalState()?.user.name).toBe(
      'Ada updated'
    );
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(instances[0]?.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('isolates account/resource switches and ignores late callbacks from old providers', async () => {
    const { result, rerender, unmount } = renderHook(
      (id) =>
        useYjsCollaboration({ ...config, id, channel: `task-editor-${id}` }),
      { wrapper, initialProps: 'one' }
    );
    const first = instances[0]!;
    const firstDoc = result.current.doc;
    rerender('two');
    expect(instances).toHaveLength(2);
    expect(first.destroyed).toBe(true);
    expect(result.current.doc).not.toBe(firstDoc);
    const second = instances[1]!;
    act(() => second.emit('status', [{ status: 'connected' }]));
    expect(result.current.connected).toBe(true);
    act(() => first.emit('disconnect', []));
    expect(result.current.connected).toBe(true);
    act(() => first.emit('synced', [true]));
    expect(result.current.synced).toBe(false);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(second.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('publishes durable hydration independently and fences an old document', async () => {
    const { result, rerender, unmount } = renderHook(
      (id) =>
        useYjsCollaboration({ ...config, id, channel: `task-editor-${id}` }),
      { wrapper, initialProps: 'one' }
    );
    const first = instances[0]!;
    act(() => first.emit('hydrated', undefined));
    expect(result.current.hydrated).toBe(true);
    expect(result.current.connected).toBe(false);
    rerender('two');
    expect(result.current.hydrated).toBe(false);
    act(() => first.emit('hydrated', undefined));
    expect(result.current.hydrated).toBe(false);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(100));
  });
  it('reports a durable read failure until a successful hydration', async () => {
    const { result, unmount } = renderHook(() => useYjsCollaboration(config), {
      wrapper,
    });
    const provider = instances[0]!;
    act(() =>
      provider.emit('error', {
        message: 'Unable to load',
        status: 'DOCUMENT_ERROR',
        channel: config.channel,
      })
    );
    expect(result.current.hydrationFailed).toBe(true);
    expect(result.current.hydrated).toBe(false);
    act(() => provider.emit('hydrated', undefined));
    expect(result.current.hydrationFailed).toBe(false);
    expect(result.current.hydrated).toBe(true);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(100));
  });
});
