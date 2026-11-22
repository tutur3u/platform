// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useWorkbenchRun } from './use-workbench-run';

vi.mock('@tuturuuu/internal-api/playgrounds', () => ({
  checkpointHostedPlayground: vi.fn(),
  getHostedPlaygroundRun: vi.fn(),
  runHostedPlayground: vi.fn(),
}));

const refused = () => Object.assign(new Error('api'), { status: 503 });

function mount(run: (operation: 'run' | 'stop') => Promise<{ runId: string }>) {
  const onRunnerUnavailable = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useWorkbenchRun({
        projectId: 'project',
        roomKey: 'room',
        execution: {
          run: (payload) => run(payload.operation),
          read: vi.fn(async () => ({
            runId: 'run',
            status: 'succeeded',
          })) as never,
        },
        checkpoint: vi.fn(async () => undefined),
        problem: false,
        owner: true,
        stdin: '',
        meeting: { onRunnerUnavailable },
        onStarted: vi.fn(),
      }),
    { wrapper }
  );
  return { ...hook, onRunnerUnavailable };
}

it('marks the runner unavailable when a run is refused, not when a stop is', async () => {
  const { result, onRunnerUnavailable } = mount(async () => {
    throw refused();
  });
  act(() => result.current.run.mutate('stop'));
  await waitFor(() => expect(result.current.run.isError).toBe(true));
  expect(result.current.runner.unavailable).toBeUndefined();
  expect(onRunnerUnavailable).not.toHaveBeenCalled();

  act(() => result.current.run.mutate('run'));
  await waitFor(() => expect(result.current.runner.unavailable).toBeTruthy());
  expect(onRunnerUnavailable).toHaveBeenLastCalledWith(true);
});

it('re-enables Run once a run starts, but a stop that succeeds does not', async () => {
  let refuse = true;
  const { result, onRunnerUnavailable } = mount(async () => {
    if (refuse) throw refused();
    return { runId: 'run' };
  });
  act(() => result.current.run.mutate('run'));
  await waitFor(() => expect(result.current.runner.unavailable).toBeTruthy());
  refuse = false;
  act(() => result.current.run.mutate('stop'));
  await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
  expect(result.current.runner.unavailable).toBeTruthy();
  act(() => result.current.run.mutate('run'));
  await waitFor(() =>
    expect(result.current.runner.unavailable).toBeUndefined()
  );
  expect(onRunnerUnavailable).toHaveBeenLastCalledWith(false);
});
