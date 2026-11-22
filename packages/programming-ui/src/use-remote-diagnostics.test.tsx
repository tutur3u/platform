// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CHECK_IDLE_MS,
  CHECK_LIMITS,
  CHECK_WARMING_BUDGET_MS,
  type CodeDiagnostic,
  MARKER_SEVERITY,
  type WorkbenchCheck,
} from './code-diagnostics';
import type { CheckMarkerSink } from './editor-markers';
import { useRemoteDiagnostics } from './use-remote-diagnostics';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const refused = (status: number, code?: string, retryAfter?: number) =>
  Object.assign(new Error('api'), { status, code, retryAfter });
const diagnostic: CodeDiagnostic = {
  path: 'main.c',
  line: 2,
  column: 3,
  severity: 'error',
  message: "expected ';'",
  source: 'gcc',
};
type Payload = Parameters<WorkbenchCheck>[0];

function mount(
  respond: (payload: Payload, signal: AbortSignal) => Promise<unknown>,
  initial: {
    content?: string | null;
    language?: PlaygroundLanguage;
    localOnly?: boolean;
  } = {}
) {
  const listeners = new Set<() => void>();
  const localEdits = initial.localOnly
    ? (onEdit: () => void) => {
        listeners.add(onEdit);
        return () => void listeners.delete(onEdit);
      }
    : undefined;
  const typed = () => act(() => listeners.forEach((listener) => listener()));
  const calls: { payload: Payload; signal: AbortSignal }[] = [];
  const check = vi.fn((payload: Payload, signal: AbortSignal) => {
    calls.push({ payload, signal });
    return respond(payload, signal);
  }) as unknown as WorkbenchCheck;
  const sink = { set: vi.fn(), clear: vi.fn() } satisfies CheckMarkerSink;
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({
      content,
      language,
    }: {
      content: string | null;
      language: PlaygroundLanguage;
    }) =>
      useRemoteDiagnostics({
        roomKey: 'room',
        language,
        files: content === null ? [] : [{ path: 'main.c', content }],
        check,
        sink,
        localEdits,
      }),
    {
      wrapper,
      initialProps: {
        content:
          initial.content === undefined ? 'int main(){}' : initial.content,
        language: initial.language ?? 'c',
      },
    }
  );
  const edit = (content: string | null, language: PlaygroundLanguage = 'c') =>
    hook.rerender({ content, language });
  return { ...hook, calls, sink, edit, typed };
}
// A little past the idle delay, so React Query's batched notifications land too.
const IDLE = CHECK_IDLE_MS.c;
const idle = (ms = IDLE + 50) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const ok = (payload: Payload, diagnostics: CodeDiagnostic[] = []) =>
  Promise.resolve({
    requestId: payload.requestId,
    diagnostics,
    truncated: false,
  });

it('checks once after 1.5 s of quiet with the latest code and maps markers', async () => {
  const { result, calls, sink, edit } = mount((payload) =>
    ok(payload, [diagnostic])
  );
  await idle(1000);
  edit('int main(){ return 0 }');
  await idle(1000);
  expect(calls).toHaveLength(0);
  await idle(600);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.payload).toMatchObject({
    language: 'c',
    files: [{ path: 'main.c', content: 'int main(){ return 0 }' }],
  });
  expect(calls[0]!.payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(result.current).toEqual({ kind: 'ready', problems: 1 });
  const byPath = sink.set.mock.calls[0]![1] as Map<string, unknown[]>;
  expect(sink.set.mock.calls[0]![0]).toBe('room');
  expect(byPath.get('main.c')).toEqual([
    expect.objectContaining({
      startLineNumber: 2,
      startColumn: 3,
      severity: MARKER_SEVERITY.error,
      source: 'gcc',
    }),
  ]);
});

it('skips an unchanged room and aborts the check in flight on a new edit', async () => {
  let release: (() => void) | undefined;
  const { calls, edit } = mount(
    (payload, signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
        release = () => resolve(ok(payload));
      })
  );
  await idle();
  expect(calls).toHaveLength(1);
  edit('int main(){ }');
  await idle(10);
  expect(calls[0]!.signal.aborted).toBe(true);
  await idle();
  expect(calls).toHaveLength(2);
  await act(async () => release?.());
  // The same text again, in a new array: nothing to check.
  edit('int main(){ }');
  await idle(IDLE * 2);
  expect(calls).toHaveLength(2);
});

it('retries a warming checker quietly for 20 s, then pauses checks', async () => {
  const { result, calls, edit } = mount(() =>
    Promise.reject(refused(503, 'PLAYGROUND_WARMING', 2))
  );
  await idle();
  expect(result.current).toEqual({ kind: 'checking' });
  await idle(CHECK_WARMING_BUDGET_MS);
  // The checker asks for 2 s; attempts stay 5 s apart, the last at 20 s.
  expect(calls).toHaveLength(5);
  expect(result.current).toEqual({ kind: 'paused' });
  edit('int x;');
  await idle(IDLE * 2);
  expect(calls).toHaveLength(5);
});

it('resumes after an unavailable pause of at least a minute, on the next edit', async () => {
  let unavailable = true;
  const { result, calls, edit } = mount((payload) =>
    unavailable
      ? Promise.reject(refused(503, 'PLAYGROUND_UNAVAILABLE', 30))
      : ok(payload)
  );
  await idle();
  expect(result.current).toEqual({ kind: 'paused' });
  await idle(50_000);
  expect(result.current).toEqual({ kind: 'paused' });
  await idle(10_000);
  // The pause ended, but the paused edit is not sent again on its own.
  expect(calls).toHaveLength(1);
  unavailable = false;
  edit('int y;');
  await idle();
  expect(calls).toHaveLength(2);
  expect(result.current).toEqual({ kind: 'ready', problems: 0 });
});

it('pauses on an unavailable checker until the language changes, and clears markers then', async () => {
  let unavailable = true;
  const { result, calls, sink, edit } = mount((payload) =>
    unavailable
      ? Promise.reject(refused(503, 'PLAYGROUND_UNAVAILABLE'))
      : ok(payload)
  );
  await idle();
  expect(result.current).toEqual({ kind: 'paused' });
  edit('int y;');
  await idle();
  expect(calls).toHaveLength(1);
  unavailable = false;
  sink.clear.mockClear();
  edit('int y;', 'cpp');
  expect(sink.clear).toHaveBeenCalledWith('room');
  await idle();
  expect(calls).toHaveLength(2);
  expect(calls[1]!.payload.language).toBe('cpp');
  expect(result.current).toEqual({ kind: 'ready', problems: 0 });
});

it('ignores a superseded check and keeps the last problems', async () => {
  let supersede = false;
  const { result, calls, sink, edit } = mount((payload) =>
    supersede
      ? Promise.reject(refused(409, 'PLAYGROUND_SUPERSEDED'))
      : ok(payload, [diagnostic])
  );
  await idle();
  expect(result.current).toEqual({ kind: 'ready', problems: 1 });
  supersede = true;
  edit('int z;');
  await idle();
  expect(calls).toHaveLength(2);
  await idle(10);
  expect(sink.set).toHaveBeenCalledTimes(1);
  expect(result.current).toEqual({ kind: 'ready', problems: 1 });
});

it('sends a conflicting request once more under a new request id', async () => {
  let conflict = true;
  const { result, calls } = mount((payload) => {
    if (!conflict) return ok(payload);
    conflict = false;
    return Promise.reject(refused(409, 'PLAYGROUND_REQUEST_CONFLICT'));
  });
  await idle();
  expect(calls).toHaveLength(2);
  expect(calls[1]!.payload.requestId).not.toBe(calls[0]!.payload.requestId);
  expect(result.current).toEqual({ kind: 'ready', problems: 0 });
});

it('stays silent and stops when the check endpoint is not deployed', async () => {
  const { result, calls, edit } = mount(() => Promise.reject(refused(404)));
  await idle();
  expect(result.current).toEqual({ kind: 'off' });
  edit('int w;');
  await idle(IDLE * 2);
  expect(calls).toHaveLength(1);
});

it('does not retry a busy checker; the next local edit asks again', async () => {
  let busy = true;
  const { result, calls, edit } = mount((payload) => {
    if (!busy) return ok(payload);
    return Promise.reject(refused(429, 'PLAYGROUND_BUSY', 2));
  });
  await idle();
  await idle(30_000);
  expect(calls).toHaveLength(1);
  expect(result.current).toEqual({ kind: 'off' });
  busy = false;
  edit('int y;');
  await idle();
  expect(calls).toHaveLength(2);
  expect(result.current).toEqual({ kind: 'ready', problems: 0 });
});

it('does not check while the page is hidden, and leaves other languages off', async () => {
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  const { calls } = mount((payload) => ok(payload));
  await idle(IDLE * 2);
  expect(calls).toHaveLength(0);
  visibility.mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await idle(10);
  expect(calls).toHaveLength(1);
  visibility.mockRestore();

  const python = mount((payload) => ok(payload), { language: 'python' });
  await idle(IDLE * 2);
  expect(python.calls).toHaveLength(0);
  expect(python.result.current).toEqual({ kind: 'off' });
});

it('clears problems and says so when the files outgrow the checker limits', async () => {
  const { result, calls, sink, edit } = mount((payload) =>
    ok(payload, [diagnostic])
  );
  await idle();
  expect(result.current).toEqual({ kind: 'ready', problems: 1 });
  sink.clear.mockClear();
  edit('x'.repeat(CHECK_LIMITS.fileBytes + 1));
  await idle();
  expect(sink.clear).toHaveBeenCalledWith('room');
  expect(result.current).toEqual({ kind: 'tooLarge' });
  expect(calls).toHaveLength(1);
  // Shrinking back checks again.
  edit('int main(){}');
  await idle();
  expect(calls).toHaveLength(2);
  expect(result.current).toEqual({ kind: 'ready', problems: 1 });
});

it('waits 2.5 s after the last edit for Java and 1.5 s for C and C++', async () => {
  const java = mount((payload) => ok(payload), { language: 'java' });
  await idle(IDLE + 50);
  expect(java.calls).toHaveLength(0);
  await idle(CHECK_IDLE_MS.java - IDLE);
  expect(java.calls).toHaveLength(1);
  expect(java.calls[0]!.payload.language).toBe('java');
  const cpp = mount((payload) => ok(payload), { language: 'cpp' });
  await idle(CHECK_IDLE_MS.cpp + 50);
  expect(cpp.calls).toHaveLength(1);
});

it('keeps a slow check quietly checking and never treats it as a failure', async () => {
  let release: ((value: unknown) => void) | undefined;
  const { result, calls } = mount(
    (payload) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            requestId: payload.requestId,
            diagnostics: [],
            truncated: false,
          });
      }),
    { language: 'java' }
  );
  await idle(CHECK_IDLE_MS.java + 50);
  await idle(60_000);
  expect(calls).toHaveLength(1);
  expect(result.current).toEqual({ kind: 'checking' });
  expect(calls[0]!.signal.aborted).toBe(false);
  await act(async () => release?.(undefined));
  await idle(10);
  expect(result.current).toEqual({ kind: 'ready', problems: 0 });
});

it('pauses once on an unavailable service and sends no further checks', async () => {
  const { result, calls, edit } = mount(async () => {
    throw refused(503, 'PLAYGROUND_UNAVAILABLE', 30);
  });
  await idle();
  expect(calls).toHaveLength(1);
  expect(result.current).toEqual({ kind: 'paused' });
  edit('int main(){ return 1; }');
  await idle(IDLE * 4);
  edit('int main(){ return 2; }');
  await idle(IDLE * 4);
  expect(calls).toHaveLength(1);
  expect(result.current).toEqual({ kind: 'paused' });
});

it('checks only after a local edit, never for a change that arrives from the room', async () => {
  const { result, calls, edit, typed } = mount((payload) => ok(payload), {
    localOnly: true,
  });
  await idle(IDLE * 2);
  expect(calls).toHaveLength(0);
  edit('int remote(){}');
  await idle(IDLE * 2);
  expect(calls).toHaveLength(0);
  expect(result.current).toEqual({ kind: 'off' });
  await typed();
  edit('int local(){}');
  await idle();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.payload.files[0]!.content).toBe('int local(){}');
  edit('int remote_again(){}');
  await idle(IDLE * 2);
  expect(calls).toHaveLength(1);
});

it('treats an empty room as idle: no check, no markers cleared, no size notice', async () => {
  const { result, calls, sink, edit } = mount((payload) => ok(payload));
  await idle();
  expect(calls).toHaveLength(1);
  sink.clear.mockClear();
  edit(null);
  await idle(IDLE * 2);
  expect(calls).toHaveLength(1);
  expect(sink.clear).not.toHaveBeenCalled();
  expect(result.current).toEqual({ kind: 'off' });
});

it('waits out the idle delay again when undoing to the text whose check was aborted', async () => {
  const { calls, edit } = mount(() => new Promise(() => undefined));
  await idle();
  expect(calls).toHaveLength(1);
  edit('int b;');
  await idle(500);
  expect(calls[0]!.signal.aborted).toBe(true);
  edit('int main(){}');
  await idle(100);
  expect(calls).toHaveLength(1);
  await idle(IDLE);
  expect(calls).toHaveLength(2);
});

it('ignores a room change that long follows a local edit which changed nothing', async () => {
  const { calls, edit, typed } = mount((payload) => ok(payload), {
    localOnly: true,
  });
  await typed();
  await idle(IDLE * 3);
  edit('int remote(){}');
  await idle(IDLE * 2);
  expect(calls).toHaveLength(0);
});
