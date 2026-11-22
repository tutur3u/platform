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

type Payload = Parameters<
  NonNullable<Parameters<typeof useWorkbenchRun>[0]['execution']>['run']
>[0];

function mount(
  run: (
    operation: 'run' | 'stop',
    payload: Payload
  ) => Promise<{ runId: string }>
) {
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
          run: (payload) => run(payload.operation, payload),
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
  act(() => result.current.runOperation('stop'));
  await waitFor(() => expect(result.current.run.isError).toBe(true));
  expect(result.current.runner.unavailable).toBeUndefined();
  expect(onRunnerUnavailable).not.toHaveBeenCalled();

  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.runner.unavailable).toBeTruthy());
  expect(onRunnerUnavailable).toHaveBeenLastCalledWith(true);
});

it('re-enables Run once a run starts, but a stop that succeeds does not', async () => {
  let refuse = true;
  const { result, onRunnerUnavailable } = mount(async () => {
    if (refuse) throw refused();
    return { runId: 'run' };
  });
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.runner.unavailable).toBeTruthy());
  refuse = false;
  act(() => result.current.runOperation('stop'));
  await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
  expect(result.current.runner.unavailable).toBeTruthy();
  act(() => result.current.runOperation('run'));
  await waitFor(() =>
    expect(result.current.runner.unavailable).toBeUndefined()
  );
  expect(onRunnerUnavailable).toHaveBeenLastCalledWith(false);
});

it('stops the current Run by id and reuses the request id only on retry', async () => {
  const payloads: Payload[] = [];
  let fail = false;
  const { result } = mount(async (_, payload) => {
    payloads.push(payload);
    if (fail) throw refused();
    return { runId: 'run-1' };
  });
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
  act(() => result.current.runOperation('stop'));
  await waitFor(() => expect(payloads).toHaveLength(2));
  expect(payloads[1]).toMatchObject({ operation: 'stop', runId: 'run-1' });
  expect(payloads[0]?.runId).toBeUndefined();
  expect(payloads[1]?.requestId).not.toBe(payloads[0]?.requestId);

  fail = true;
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.run.isError).toBe(true));
  const variables = result.current.run.variables!;
  act(() => result.current.run.mutate(variables));
  await waitFor(() => expect(payloads).toHaveLength(4));
  expect(payloads[3]?.requestId).toBe(payloads[2]?.requestId);
});
