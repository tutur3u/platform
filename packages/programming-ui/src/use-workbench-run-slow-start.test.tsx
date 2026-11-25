// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SLOW_START_MS } from './use-slow-start-notice';
import { useWorkbenchRun } from './use-workbench-run';

vi.mock('@tuturuuu/internal-api/playgrounds', () => ({
  checkpointHostedPlayground: vi.fn(),
  getHostedPlaygroundRun: vi.fn(),
  runHostedPlayground: vi.fn(),
}));

const state = { status: 'queued' as string };

function mount(
  options: {
    meeting?: boolean;
    run?: () => Promise<{ runId: string }>;
    checkpoint?: () => Promise<unknown>;
  } = {}
) {
  const { meeting = true } = options;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useWorkbenchRun({
        projectId: 'project',
        roomKey: 'room',
        execution: {
          run: options.run ?? (async () => ({ runId: 'run' })),
          read: vi.fn(async () => ({
            runId: 'run',
            status: state.status,
          })) as never,
        },
        checkpoint: options.checkpoint ?? (async () => undefined),
        problem: false,
        owner: true,
        stdin: '',
        meeting: meeting ? { onRunnerAvailability: vi.fn() } : undefined,
        onStarted: vi.fn(),
      }),
    { wrapper }
  );
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  state.status = 'queued';
});
afterEach(() => vi.useRealTimers());

it('shows the sandbox note only once a submitted Run is still going after 3 s', async () => {
  const { result } = mount();
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS - 200);
  expect(result.current.slowStart).toBe(false);
  await advance(400);
  expect(result.current.slowStart).toBe(true);
});

it('clears the note when the Run reaches a terminal state', async () => {
  for (const terminal of ['succeeded', 'failed', 'cancelled']) {
    state.status = 'running';
    const { result, unmount } = mount();
    act(() => result.current.runOperation('run'));
    await advance(SLOW_START_MS + 200);
    expect(result.current.slowStart).toBe(true);
    state.status = terminal;
    await advance(700);
    expect(result.current.slowStart).toBe(false);
    unmount();
  }
});

it('clears the note as soon as Stop is pressed', async () => {
  const { result } = mount();
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS + 200);
  expect(result.current.slowStart).toBe(true);
  act(() => result.current.runOperation('stop'));
  expect(result.current.slowStart).toBe(false);
});

it('never says the sandbox is starting while waiting for a free runner', async () => {
  let attempts = 0;
  const busy = Object.assign(new Error('busy'), {
    code: 'PLAYGROUND_BUSY',
    retryAfterSeconds: 10,
  });
  const { result } = mount({
    run: async () => {
      attempts += 1;
      if (attempts === 1) throw busy;
      return { runId: 'run' };
    },
  });
  act(() => result.current.runOperation('run'));
  // Well past 3 s, but the Run is only waiting for a runner.
  await advance(SLOW_START_MS + 3000);
  expect(result.current.waiting).toBe(true);
  expect(result.current.slowStart).toBe(false);
  // The wait ends and the Run is queued; the note may appear 3 s later.
  await advance(4100);
  expect(result.current.waiting).toBe(false);
  expect(result.current.slowStart).toBe(false);
  await advance(SLOW_START_MS + 200);
  expect(result.current.slowStart).toBe(true);
});

it('starts the 3 s clock only after the room is saved', async () => {
  let release: (() => void) | undefined;
  const { result } = mount({
    checkpoint: () =>
      new Promise((resolve) => {
        release = () => resolve(undefined);
      }),
  });
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS + 2000);
  expect(result.current.slowStart).toBe(false);
  await act(async () => release?.());
  await advance(SLOW_START_MS - 200);
  expect(result.current.slowStart).toBe(false);
  await advance(400);
  expect(result.current.slowStart).toBe(true);
});

it('never shows it outside a meeting', async () => {
  const { result } = mount({ meeting: false });
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS + 500);
  expect(result.current.slowStart).toBe(false);
});

it('a Retry restarts the clock after its own slow save', async () => {
  let release: (() => void) | undefined;
  let saves = 0;
  let runs = 0;
  const { result } = mount({
    run: async () => {
      runs += 1;
      // The first attempt fails; the Retry's run hangs, so the clock is the
      // only thing that can raise the note.
      if (runs === 1) throw new Error('boom');
      return new Promise<{ runId: string }>(() => undefined);
    },
    checkpoint: () =>
      new Promise((resolve) => {
        saves += 1;
        if (saves === 1) resolve(undefined);
        else release = () => resolve(undefined);
      }),
  });
  act(() => result.current.runOperation('run'));
  await advance(100);
  expect(result.current.run.isError).toBe(true);
  // Retry re-runs the same mutation input, as the workbench's Retry does.
  act(() => result.current.run.mutate(result.current.run.variables as never));
  await advance(SLOW_START_MS + 2000);
  expect(result.current.slowStart).toBe(false);
  await act(async () => release?.());
  await advance(SLOW_START_MS - 200);
  expect(result.current.slowStart).toBe(false);
  await advance(600);
  expect(result.current.slowStart).toBe(true);
});
