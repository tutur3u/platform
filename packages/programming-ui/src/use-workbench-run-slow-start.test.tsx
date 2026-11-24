// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

function mount(meeting: boolean) {
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
          run: async () => ({ runId: 'run' }),
          read: vi.fn(async () => ({
            runId: 'run',
            status: state.status,
          })) as never,
        },
        checkpoint: vi.fn(async () => undefined),
        problem: false,
        owner: true,
        stdin: '',
        meeting: meeting ? { onRunnerUnavailable: vi.fn() } : undefined,
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
  const { result } = mount(true);
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS - 200);
  expect(result.current.slowStart).toBe(false);
  await advance(400);
  expect(result.current.slowStart).toBe(true);
});

it('clears the note when the Run reaches a terminal state', async () => {
  for (const terminal of ['succeeded', 'failed', 'cancelled']) {
    state.status = 'running';
    const { result, unmount } = mount(true);
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
  const { result } = mount(true);
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS + 200);
  expect(result.current.slowStart).toBe(true);
  act(() => result.current.runOperation('stop'));
  expect(result.current.slowStart).toBe(false);
});

it('never shows it outside a meeting, and never for compile-only checks', async () => {
  const { result } = mount(false);
  act(() => result.current.runOperation('run'));
  await advance(SLOW_START_MS + 500);
  expect(result.current.slowStart).toBe(false);
  // Checks run through the diagnostics hook, which has its own warming state.
  const diagnostics = readFileSync(
    join(process.cwd(), 'src/use-remote-diagnostics.ts'),
    'utf8'
  );
  expect(diagnostics).not.toContain('slowStart');
  expect(diagnostics).not.toContain('use-slow-start-notice');
});
