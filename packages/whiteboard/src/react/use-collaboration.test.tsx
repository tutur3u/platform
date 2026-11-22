import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeElement } from '../testing/fixtures';
import { createMemoryTransportHub } from '../testing/memory-adapters';
import { useWhiteboardCollaboration } from './use-collaboration';

const ada = { id: 'ada', displayName: 'Ada' };
const bo = { id: 'bo', displayName: 'Bo' };

describe('useWhiteboardCollaboration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers debounced element changes to the other peer, merged by the caller', async () => {
    const hub = createMemoryTransportHub();
    const transportA = hub.createPeer();
    const transportB = hub.createPeer();
    const onRemote = vi.fn();
    const stableAda = ada;
    const stableBo = bo;

    const a = renderHook(() =>
      useWhiteboardCollaboration({ transport: transportA, user: stableAda })
    );
    renderHook(() =>
      useWhiteboardCollaboration({
        transport: transportB,
        user: stableBo,
        onRemoteElementsChange: onRemote,
      })
    );

    expect(a.result.current.isConnected).toBe(true);

    act(() => {
      a.result.current.broadcastElementChanges([], [makeElement('x')]);
      a.result.current.broadcastElementChanges(
        [makeElement('x')],
        [makeElement('x', { version: 2 })]
      );
    });
    expect(onRemote).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(onRemote).toHaveBeenCalledOnce();
    const [elements] = onRemote.mock.calls[0] as [
      ReturnType<typeof makeElement>[],
    ];
    expect(elements.map((el) => [el.id, el.version])).toEqual([['x', 2]]);
  });

  it('shows a remote cursor as a collaborator and drops it when it goes quiet', async () => {
    const hub = createMemoryTransportHub();
    const transportA = hub.createPeer();
    const transportB = hub.createPeer();

    const a = renderHook(() =>
      useWhiteboardCollaboration({ transport: transportA, user: ada })
    );
    const b = renderHook(() =>
      useWhiteboardCollaboration({
        transport: transportB,
        user: bo,
        presence: [{ id: 'ada', displayName: 'Ada' }],
      })
    );

    act(() => {
      a.result.current.broadcastCursorPosition(10, 20, 'pointer');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(
      b.result.current.collaborators.get('ada' as never)?.pointer
    ).toMatchObject({ tool: 'pointer' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });

    expect(
      b.result.current.collaborators.get('ada' as never)?.pointer
    ).toBeUndefined();
  });

  it('stays idle without a user id or when disabled', () => {
    const hub = createMemoryTransportHub();
    const transport = hub.createPeer();
    const connect = vi.spyOn(transport, 'connect');

    const idle = renderHook(() =>
      useWhiteboardCollaboration({
        transport,
        user: { id: '', displayName: '' },
      })
    );
    const off = renderHook(() =>
      useWhiteboardCollaboration({ transport, user: ada, enabled: false })
    );

    expect(connect).not.toHaveBeenCalled();
    expect(idle.result.current.isConnected).toBe(false);
    expect(off.result.current.isConnected).toBe(false);
  });

  it('requeues a batch the transport failed to send and reports the error', async () => {
    const hub = createMemoryTransportHub();
    const transport = hub.createPeer();
    const sendElementChanges = vi
      .spyOn(transport, 'sendElementChanges')
      .mockRejectedValueOnce(new Error('offline'));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useWhiteboardCollaboration({ transport, user: ada, onError })
    );

    act(() => {
      result.current.broadcastElementChanges([], [makeElement('x')]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    act(() => {
      result.current.broadcastElementChanges(
        [makeElement('x')],
        [makeElement('x', { version: 2 })]
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(sendElementChanges).toHaveBeenCalledTimes(2);
    const retried = sendElementChanges.mock.calls[1]?.[0];
    expect(
      retried?.changes.map((c) => [c.element.id, c.element.version])
    ).toEqual([['x', 2]]);
  });

  it('keeps element and cursor channel errors separate and only reports element ones', async () => {
    const hub = createMemoryTransportHub();
    const transport = hub.createPeer();
    let handlers: Parameters<typeof transport.connect>[0] | null = null;
    const connect = transport.connect.bind(transport);
    vi.spyOn(transport, 'connect').mockImplementation((h) => {
      handlers = h;
      return connect(h);
    });
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useWhiteboardCollaboration({ transport, user: ada, onError })
    );

    act(() => {
      handlers!.onStatus('error', new Error('cursor down'), 'cursors');
      handlers!.onStatus('error', new Error('cursor down'), 'cursors');
      handlers!.onStatus('error', new Error('cursor down'), 'cursors');
    });
    expect(onError).not.toHaveBeenCalled();

    // The spent cursor budget does not stop element sends.
    const send = vi.spyOn(transport, 'sendElementChanges');
    act(() => {
      handlers!.onStatus('connected');
      result.current.broadcastElementChanges([], [makeElement('x')]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(send).toHaveBeenCalledOnce();

    act(() => {
      handlers!.onStatus('error', new Error('elements down'), 'elements');
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'elements down' })
    );
  });
});
