import type { LiveServerMessage, Session } from '@google/genai/web';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), memory: vi.fn() }));
vi.mock('@google/genai/web', () => ({
  Modality: { AUDIO: 'AUDIO' },
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
  GoogleGenAI: class {
    live = { connect: mocks.connect };
  },
}));
vi.mock('../../../cloudflare/live/storage', () => ({
  readLiveMemory: mocks.memory,
}));

import { connectLiveProvider } from '../../../cloudflare/live/provider';
import { EMPTY_LIVE_JOURNAL } from './context';

type Callbacks = { onmessage: (message: LiveServerMessage) => void };
const input = () => ({
  env: {} as Parameters<typeof connectLiveProvider>[0]['env'],
  claims: { mode: 'personal' } as Parameters<
    typeof connectLiveProvider
  >[0]['claims'],
  timezone: 'UTC',
  sharedContext: '',
  journal: structuredClone(EMPTY_LIVE_JOURNAL),
  onMessage: vi.fn(),
  onClose: vi.fn(),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.memory.mockResolvedValue({ enabled: false, memories: [] });
});
afterEach(() => vi.useRealTimers());
it('does not expose a connected provider before setupComplete', async () => {
  let callbacks!: Callbacks;
  const session = { close: vi.fn() } as unknown as Session;
  mocks.connect.mockImplementation((options: { callbacks: Callbacks }) => {
    callbacks = options.callbacks;
    return Promise.resolve(session);
  });
  let ready = false;
  const connection = connectLiveProvider(input()).then((value) => {
    ready = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(ready).toBe(false);
  callbacks.onmessage({ setupComplete: {} } as LiveServerMessage);
  expect(await connection).toBe(session);
});
it('closes a connection that arrives after the setup deadline', async () => {
  let resolve!: (session: Session) => void;
  mocks.connect.mockReturnValue(
    new Promise<Session>((done) => {
      resolve = done;
    })
  );
  const connection = connectLiveProvider(input());
  const rejected = expect(connection).rejects.toThrow('live_setup_timeout');
  await vi.advanceTimersByTimeAsync(20001);
  await rejected;
  const close = vi.fn();
  resolve({ close } as unknown as Session);
  await vi.advanceTimersByTimeAsync(1);
  expect(close).toHaveBeenCalledOnce();
});
