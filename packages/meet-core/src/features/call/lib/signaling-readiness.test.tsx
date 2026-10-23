// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { Lobby } from '../components/lobby';
import { MeetSignaling } from './signaling';

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  constructor() {
    super();
    Socket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  message(message: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    );
  }
}
function fixture(
  resolveUrl: (signal?: AbortSignal) => Promise<string> | string = () =>
    'ws://test'
) {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('WebSocket', Socket);
  const onStatusChange = vi.fn();
  const onMessage = vi.fn();
  const signaling = new MeetSignaling({
    resolveUrl,
    onStatusChange,
    onMessage,
  });
  signaling.connect();
  return { signaling, onStatusChange, onMessage };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Socket.instances = [];
});

it('bounds a hung token resolution and ignores its late result', async () => {
  let resolve!: (url: string) => void;
  const signals: Array<AbortSignal | undefined> = [];
  const { signaling, onStatusChange } = fixture((signal) => {
    signals.push(signal);
    return new Promise((done) => {
      resolve = done;
    });
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(signals[0]?.aborted).toBe(true);
  expect(onStatusChange).toHaveBeenCalledWith('error');
  resolve('ws://late');
  await Promise.resolve();
  expect(Socket.instances).toHaveLength(0);
  signaling.close();
});

it('exhausts a finite budget even when every socket opens without ready', async () => {
  const { signaling, onStatusChange } = fixture();
  for (let index = 0; index < 13; index++) {
    await vi.advanceTimersByTimeAsync(index === 0 ? 0 : 1);
    const socket = Socket.instances.at(-1)!;
    socket.open();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.readyState).toBe(2);
  }
  const count = Socket.instances.length;
  expect(count).toBe(13);
  expect(onStatusChange).toHaveBeenLastCalledWith('error');
  await vi.advanceTimersByTimeAsync(120_000);
  expect(Socket.instances).toHaveLength(count);
  signaling.close();
});

it.each(['waiting', 'admitted'])(
  'accepts %s ready without timing out host admission',
  async (admission) => {
    const { signaling, onStatusChange } = fixture();
    await Promise.resolve();
    const socket = Socket.instances[0]!;
    socket.open();
    socket.message({ type: 'ready', userId: 'self', admission });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(1);
    expect(onStatusChange).toHaveBeenLastCalledWith('open');
    signaling.close();
  }
);

it('aborts resolution on leave and never opens a late socket', async () => {
  let resolve!: (url: string) => void;
  let signal: AbortSignal | undefined;
  const { signaling, onMessage } = fixture((value) => {
    signal = value;
    return new Promise((done) => {
      resolve = done;
    });
  });
  signaling.close();
  expect(signal?.aborted).toBe(true);
  resolve('ws://late');
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(0);
  expect(onMessage).not.toHaveBeenCalled();
});

it('stops after repeated token failures and leaves an observable error', async () => {
  const resolveUrl = vi.fn().mockRejectedValue(new Error('unavailable'));
  const { signaling, onStatusChange } = fixture(resolveUrl);
  await vi.advanceTimersByTimeAsync(1000);
  expect(resolveUrl).toHaveBeenCalledTimes(13);
  expect(onStatusChange).toHaveBeenLastCalledWith('error');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(resolveUrl).toHaveBeenCalledTimes(13);
  signaling.close();
});

it('ignores ready from an expired socket and preserves a terminal decision', async () => {
  const { signaling, onMessage } = fixture();
  await Promise.resolve();
  const first = Socket.instances[0]!;
  first.open();
  await vi.advanceTimersByTimeAsync(10_001);
  const next = Socket.instances[1]!;
  next.open();
  first.message({ type: 'ready', userId: 'stale', admission: 'admitted' });
  expect(onMessage).not.toHaveBeenCalled();
  next.message({
    type: 'admission.result',
    admitted: false,
    decidedBy: 'host',
  });
  expect(signaling.isClosed).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(Socket.instances).toHaveLength(2);
});

function drop(socket: Socket) {
  socket.readyState = 3;
  socket.dispatchEvent(new Event('close'));
}

it.each(['waiting', 'admitted'])(
  'exhausts retries across repeated %s ready then disconnect cycles',
  async (admission) => {
    const { signaling, onStatusChange } = fixture();
    await Promise.resolve();
    for (let index = 0; index < 13; index++) {
      expect(Socket.instances).toHaveLength(index + 1);
      const socket = Socket.instances.at(-1)!;
      socket.open();
      socket.message({ type: 'ready', userId: 'self', admission });
      drop(socket);
      if (index < 12) {
        await vi.advanceTimersByTimeAsync(
          admission === 'waiting' && index > 0 ? 60_000 : 1
        );
      }
    }
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
    const onRetry = vi.fn();
    const view = render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Lobby
          defaultDisplayName="Test participant"
          meetingName="Test room"
          connectionStatus={onStatusChange.mock.lastCall![0]}
          error={null}
          isJoining={false}
          waiting={admission === 'waiting'}
          onJoin={vi.fn()}
          onLeave={() => signaling.close()}
          onRetry={onRetry}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(en.meet.call.join_error_title)).toBeTruthy();
    expect(view.container.querySelector('[class*="animate-spin"]')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: en.meet.call.connection_refresh })
    );
    expect(onRetry).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(Socket.instances).toHaveLength(13);
    signaling.close();
  }
);

it('reconnects pending admission immediately once, then throttles repeats and cancels on leave', async () => {
  const { signaling } = fixture();
  await Promise.resolve();
  const first = Socket.instances[0]!;
  first.open();
  first.message({ type: 'ready', userId: 'self', admission: 'waiting' });
  drop(first);
  await vi.advanceTimersByTimeAsync(1);
  expect(Socket.instances).toHaveLength(2);
  const second = Socket.instances[1]!;
  second.open();
  second.message({ type: 'ready', userId: 'self', admission: 'waiting' });
  drop(second);
  await vi.advanceTimersByTimeAsync(59_998);
  expect(Socket.instances).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(2);
  expect(Socket.instances).toHaveLength(3);
  const third = Socket.instances[2]!;
  third.open();
  third.message({ type: 'ready', userId: 'self', admission: 'waiting' });
  drop(third);
  signaling.close();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(Socket.instances).toHaveLength(3);
});

it('renews the retry budget only after thirty seconds of stable ready', async () => {
  const { signaling, onStatusChange } = fixture();
  await Promise.resolve();
  for (let index = 0; index < 13; index++) {
    const socket = Socket.instances.at(-1)!;
    socket.open();
    socket.message({ type: 'ready', userId: 'self', admission: 'admitted' });
    if (index === 12) await vi.advanceTimersByTimeAsync(30_000);
    drop(socket);
    await vi.advanceTimersByTimeAsync(1);
  }
  expect(Socket.instances).toHaveLength(14);
  expect(onStatusChange).toHaveBeenLastCalledWith('connecting');
  signaling.close();
});

it.each(['disconnect', 'visibility change'])(
  'preserves the retry budget across a %s just before thirty seconds',
  async (event) => {
    const { signaling, onStatusChange } = fixture();
    await Promise.resolve();
    for (let index = 0; index < 13; index++) {
      const socket = Socket.instances.at(-1)!;
      socket.open();
      socket.message({ type: 'ready', userId: 'self', admission: 'admitted' });
      if (index === 12) {
        await vi.advanceTimersByTimeAsync(29_999);
        if (event === 'visibility change') {
          vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(
            'hidden'
          );
          document.dispatchEvent(new Event('visibilitychange'));
          vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(
            'visible'
          );
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }
      drop(socket);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(Socket.instances).toHaveLength(13);
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(13);
    signaling.close();
  }
);

it.each([-3_600_000, 3_600_000])(
  'does not let a wall-clock jump of %i ms bypass admission throttling or stability',
  async (jump) => {
    const { signaling, onStatusChange } = fixture();
    await Promise.resolve();
    const first = Socket.instances[0]!;
    first.open();
    first.message({ type: 'ready', userId: 'self', admission: 'waiting' });
    drop(first);
    await vi.advanceTimersByTimeAsync(1);
    const second = Socket.instances[1]!;
    second.open();
    second.message({ type: 'ready', userId: 'self', admission: 'waiting' });
    await vi.advanceTimersByTimeAsync(29_999);
    vi.setSystemTime(Date.now() + jump);
    drop(second);
    await vi.advanceTimersByTimeAsync(1);
    expect(Socket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(Socket.instances).toHaveLength(3);
    for (let index = 2; index < 13; index++) {
      const socket = Socket.instances.at(-1)!;
      socket.open();
      socket.message({ type: 'ready', userId: 'self', admission: 'waiting' });
      drop(socket);
      if (index < 12) await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
    expect(Socket.instances).toHaveLength(13);
    signaling.close();
  }
);
