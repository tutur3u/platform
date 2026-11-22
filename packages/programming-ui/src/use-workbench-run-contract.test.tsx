// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { useWorkbenchRun } from './use-workbench-run';
import { WorkbenchFailureNotice } from './workbench-failure-notice';
import { workbenchFailure } from './workbench-errors';
import { outputView } from './workbench-layout';
import { WorkbenchOutput } from './workbench-output';
import { workbenchRunFailure } from './workbench-run-failure';

vi.mock('@tuturuuu/internal-api/playgrounds', () => ({
  checkpointHostedPlayground: vi.fn(),
  getHostedPlaygroundRun: vi.fn(),
  runHostedPlayground: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const t = messages.programmingPlayground;
const refused = (status: number, code: string, retryAfter?: number) =>
  Object.assign(new Error('api'), { status, code, retryAfter });

type Payload = Parameters<
  NonNullable<Parameters<typeof useWorkbenchRun>[0]['execution']>['run']
>[0];

const checkpoint = vi.fn(async () => undefined);
function mount(
  run: (payload: Payload) => Promise<{ runId: string }>,
  read: (runId: string) => Promise<Partial<PlaygroundExecutionResult>> = async (
    runId
  ) => ({ runId, status: 'succeeded' }),
  meeting = true
) {
  const payloads: Payload[] = [];
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
          run: (payload) => {
            payloads.push(payload);
            return run(payload);
          },
          read: read as never,
        },
        checkpoint,
        problem: false,
        owner: true,
        stdin: '',
        meeting: meeting ? {} : undefined,
        onStarted: vi.fn(),
      }),
    { wrapper }
  );
  return { ...hook, payloads };
}

it('names a queued Run as the runner starting, only in meetings', async () => {
  const read = async (runId: string) => ({ runId, status: 'queued' });
  const meeting = mount(async () => ({ runId: 'run' }), read);
  act(() => meeting.result.current.runOperation('run'));
  await waitFor(() => expect(meeting.result.current.phase).toBe('starting'));
  expect(meeting.result.current.run.error).toBeNull();
  cleanup();
  const learn = mount(async () => ({ runId: 'run' }), read, false);
  act(() => learn.result.current.runOperation('run'));
  await waitFor(() =>
    expect(learn.result.current.result.data?.status).toBe('queued')
  );
  expect(learn.result.current.phase).toBeUndefined();
});

it('waits once for a free runner under a new request id, then asks', async () => {
  vi.useFakeTimers();
  const { result, payloads } = mount(async () => {
    throw refused(429, 'PLAYGROUND_BUSY', 3);
  });
  act(() => result.current.runOperation('run'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(payloads).toHaveLength(1);
  expect(result.current.phase).toBe('waiting');
  expect(result.current.run.error).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(payloads).toHaveLength(2);
  expect(payloads[1]!.requestId).not.toBe(payloads[0]!.requestId);
  expect(result.current.phase).toBeUndefined();
  expect(workbenchFailure({ run: result.current.run.error })).toMatchObject({
    step: 'run',
    reason: 'busy',
  });
  // A manual Retry gets its own single wait and resend.
  act(() => result.current.run.mutate(result.current.run.variables!));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(payloads).toHaveLength(3);
  expect(result.current.run.isError).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(payloads).toHaveLength(4);
});

it('keeps Run enabled on a quota refusal and says when to try again', async () => {
  const { result } = mount(async () => {
    throw refused(429, 'PLAYGROUND_QUOTA', 240);
  });
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.run.isError).toBe(true));
  expect(result.current.runner.unavailable).toBeUndefined();
  const failure = workbenchFailure({ run: result.current.run.error })!;
  expect(failure).toEqual({
    step: 'run',
    reason: 'capacity',
    retryAfterSeconds: 240,
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchFailureNotice failure={failure} onRetry={vi.fn()} />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('Try again in 4 min.')).toBeTruthy();
});

it('sends a conflicting request once more under a new request id, silently', async () => {
  let conflict = true;
  const { result, payloads } = mount(async () => {
    if (!conflict) return { runId: 'run' };
    conflict = false;
    throw refused(409, 'PLAYGROUND_REQUEST_CONFLICT');
  });
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
  expect(payloads).toHaveLength(2);
  expect(payloads[1]!.requestId).not.toBe(payloads[0]!.requestId);
});

it('tells a Run the service could not start apart from the program failing', async () => {
  const { result } = mount(
    async () => ({ runId: 'run' }),
    async (runId) => ({
      runId,
      status: 'failed',
      exitCode: 1,
      output: '',
      reason: 'sandbox_failed',
    })
  );
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.sandboxFailed).toBe(true));
  const runAgain = vi.fn();
  const state = workbenchRunFailure({
    save: { error: null },
    run: result.current.run,
    result: { error: null },
    test: { error: null },
    sandboxFailed: result.current.sandboxFailed,
    retrySave: vi.fn(),
    retryTest: vi.fn(),
    retryResult: vi.fn(),
    retryRun: vi.fn(),
    runAgain,
  });
  expect(state.failure).toEqual({ step: 'start', reason: 'sandbox' });
  state.retry();
  expect(runAgain).toHaveBeenCalledOnce();
  const view = outputView(false, '', result.current.result.data);
  expect(view.exitCode).toBeNull();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={view}
        save="idle"
        failure={state.failure}
        onRetry={state.retry}
        embedded
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByText(t.failureStep.start)).toBeTruthy();
  expect(screen.queryByText(/Exited with code/)).toBeNull();
  // A program's own non-zero exit stays an exit code, not a start failure.
  expect(
    outputView(false, '', {
      runId: 'run',
      status: 'failed',
      exitCode: 1,
      output: '',
      revision: 1,
      saved: true,
      reason: null,
    }).exitCode
  ).toBe(1);
});

it('shows the runner phases in the console while nothing has printed', () => {
  const view = { text: '', exitCode: null, running: false };
  const { rerender } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={{ ...view, phase: 'waiting' }}
        save="idle"
        embedded
      />
    </NextIntlClientProvider>
  );
  expect(screen.getAllByText(t.runnerWaiting).length).toBeGreaterThan(0);
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={{ ...view, running: true, phase: 'starting' }}
        save="idle"
        embedded
      />
    </NextIntlClientProvider>
  );
  expect(screen.getAllByText(t.runnerStarting).length).toBeGreaterThan(0);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('cancels the wait for a free runner when Stop is pressed, without a failure or a stop request', async () => {
  vi.useFakeTimers();
  const { result, payloads } = mount(async () => {
    throw refused(429, 'PLAYGROUND_BUSY', 20);
  });
  act(() => result.current.runOperation('run'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(result.current.waiting).toBe(true);
  act(() => result.current.runOperation('stop'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(result.current.waiting).toBe(false);
  expect(result.current.phase).toBeUndefined();
  expect(result.current.run.isPending).toBe(false);
  expect(result.current.run.error).toBeNull();
  expect(result.current.runner.unavailable).toBeUndefined();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(payloads.map((payload) => payload.operation)).toEqual(['run']);
});

it('saves the room once for a Run that waits for a runner', async () => {
  vi.useFakeTimers();
  checkpoint.mockClear();
  const { result, payloads } = mount(async () => {
    throw refused(429, 'PLAYGROUND_BUSY', 2);
  });
  act(() => result.current.runOperation('run'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500);
  });
  expect(payloads).toHaveLength(2);
  expect(checkpoint).toHaveBeenCalledTimes(1);
});

it('shows a conflicting manual Retry instead of sending it again under a new id', async () => {
  const { result, payloads } = mount(async () => {
    throw refused(409, 'PLAYGROUND_REQUEST_CONFLICT');
  });
  act(() => result.current.runOperation('run'));
  await waitFor(() => expect(result.current.run.isError).toBe(true));
  // The fresh Run was re-sent once as a new ID; the Retry reuses that last
  // ID (the one the service may have accepted) and is not re-sent.
  expect(payloads).toHaveLength(2);
  act(() => result.current.run.mutate(result.current.run.variables!));
  await waitFor(() => expect(payloads).toHaveLength(3));
  await waitFor(() => expect(result.current.run.isError).toBe(true));
  expect(payloads).toHaveLength(3);
  expect(payloads[2]!.requestId).toBe(payloads[1]!.requestId);
  expect(payloads[1]!.requestId).not.toBe(payloads[0]!.requestId);
});
