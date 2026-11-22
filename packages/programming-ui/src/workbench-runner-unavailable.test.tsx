// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { runnerGate, useRunnerAvailability } from './use-runner-availability';
import { WorkbenchEditorStatus } from './workbench-editor-status';
import { WorkbenchStepError } from './workbench-errors';
import { WorkbenchMeetingOutput } from './workbench-meeting-output';
import type { WorkbenchRunner } from './workbench-runner-unavailable';
import { WorkbenchToolbar } from './workbench-toolbar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

function stubClipboard(writeText: (value: string) => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: spy },
  });
  return spy;
}
const t = messages.programmingPlayground;
const unavailable = Object.assign(new Error('api'), { status: 503 });
const file = { path: 'src/main.py', content: 'print("hi")\n' };

function intl(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TooltipProvider>{children}</TooltipProvider>
    </NextIntlClientProvider>
  );
}

function toolbar(runnerUnavailable?: string, onRun = vi.fn()) {
  render(
    intl(
      <>
        <WorkbenchToolbar
          title="Demo"
          language="python"
          status="open"
          participants={[]}
          actions={[]}
          meeting={{}}
          controls={{
            kind: 'playground',
            editable: true,
            busy: false,
            pending: false,
            onRun,
            onStop: vi.fn(),
            unavailable: runnerUnavailable,
          }}
        />
        {runnerUnavailable && <p id={runnerUnavailable}>card</p>}
      </>
    )
  );
  return onRun;
}

it('keeps Run focusable but aria-disabled and described by the runner card', () => {
  const onRun = toolbar('runner-card');
  const run = screen.getByRole('button', { name: new RegExp(t.run) });
  expect(run.hasAttribute('disabled')).toBe(false);
  expect(run.getAttribute('aria-disabled')).toBe('true');
  expect(run.getAttribute('aria-describedby')).toBe('runner-card');
  expect(run.hasAttribute('aria-keyshortcuts')).toBe(false);
  fireEvent.click(run);
  expect(onRun).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: t.stop }).hasAttribute('disabled')
  ).toBe(true);
});

it('leaves Run enabled with no description while the runner is ready', () => {
  toolbar();
  const run = screen.getByRole('button', { name: new RegExp(t.run) });
  expect(run.hasAttribute('disabled')).toBe(false);
  expect(run.hasAttribute('aria-disabled')).toBe(false);
  expect(run.hasAttribute('aria-describedby')).toBe(false);
  expect(run.getAttribute('aria-keyshortcuts')).toBe('Control+Enter');
});

it('shows non-hosts the room language as a read-only chip in the toolbar', () => {
  toolbar();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.getByTitle(t.languageHostOnly).textContent).toContain('Python');
});

function output(
  runner: Partial<WorkbenchRunner> = {},
  tab: 'console' | 'preview' = 'console'
) {
  return intl(
    <WorkbenchMeetingOutput
      tab={tab}
      onTab={vi.fn()}
      view={{ text: '', running: false, exitCode: null }}
      save="idle"
      testing={false}
      canTest={false}
      runner={{
        id: 'runner-card',
        file,
        onRetry: vi.fn(),
        retryDisabled: false,
        saveFailed: false,
        ...runner,
      }}
    />
  );
}

it('explains the unavailable runner above every output tab with a retry', () => {
  const onRetry = vi.fn();
  const { rerender } = render(output({ onRetry }));
  const card = screen.getByRole('status');
  expect(card.id).toBe('runner-card');
  expect(card.textContent).toContain(t.runnerUnavailableTitle);
  expect(card.textContent).toContain(t.runnerUnavailableBody);
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: t.retry }));
  expect(onRetry).toHaveBeenCalledOnce();

  rerender(output({ onRetry, retryDisabled: true }, 'preview'));
  expect(screen.getByText(t.runnerUnavailableTitle)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: t.retry }).hasAttribute('disabled')
  ).toBe(true);
  rerender(output({ onRetry: undefined }));
  expect(screen.queryByRole('button', { name: t.retry })).toBeNull();
});

it('does not claim the code is saved while the last save failed', () => {
  render(output({ saveFailed: true }));
  const card = screen.getByRole('status');
  expect(card.textContent).toContain(t.runnerUnavailableUnsaved);
  expect(card.textContent).not.toContain(t.runnerUnavailableBody);
});

it('copies the code, confirms briefly, and drops the confirmation on edits', async () => {
  const writeText = stubClipboard(async () => undefined);
  vi.useFakeTimers();
  const { rerender } = render(output());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t.copyCode }));
  });
  expect(writeText).toHaveBeenCalledWith(file.content);
  expect(screen.getByRole('button', { name: t.codeCopied })).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole('button', { name: t.copyCode })).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t.copyCode }));
  });
  rerender(output({ file: { ...file, content: 'print("edited")\n' } }));
  expect(screen.getByRole('button', { name: t.copyCode })).toBeTruthy();
});

it('gives a second copy its full confirmation', async () => {
  stubClipboard(async () => undefined);
  vi.useFakeTimers();
  render(output());
  const copy = async () =>
    act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /^(Copy code|Copied)$/ })
      );
    });
  await copy();
  act(() => vi.advanceTimersByTime(1600));
  await copy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('button', { name: t.codeCopied })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('button', { name: t.copyCode })).toBeTruthy();
});

it('cancels the copy reset on unmount and ignores a late clipboard answer', async () => {
  vi.useFakeTimers();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  stubClipboard(async () => undefined);
  const first = render(output());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t.copyCode }));
  });
  expect(vi.getTimerCount()).toBe(1);
  first.unmount();
  expect(vi.getTimerCount()).toBe(0);

  let settle = () => {};
  stubClipboard(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      })
  );
  const second = render(output());
  fireEvent.click(screen.getByRole('button', { name: t.copyCode }));
  second.unmount();
  await act(async () => settle());
  expect(vi.getTimerCount()).toBe(0);
  expect(errors).not.toHaveBeenCalled();
});

it('says copying failed where the clipboard API is missing', () => {
  render(output());
  fireEvent.click(screen.getByRole('button', { name: t.copyCode }));
  expect(screen.getByRole('alert').textContent).toBe(t.copyFailed);
});

it('downloads through an attached link and revokes the URL afterwards', () => {
  vi.useFakeTimers();
  const createObjectURL = vi.fn(() => 'blob:code');
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  let attached = false;
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      attached = this.isConnected;
      expect(this.download).toBe('main.py');
    });
  render(output());
  fireEvent.click(screen.getByRole('button', { name: 'Download main.py' }));
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  expect(attached).toBe(true);
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revokeObjectURL).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1000));
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:code');
});

it('keeps the runner state off problems and keeps other failures visible', () => {
  const refused = { step: 'run', reason: 'unavailable' } as const;
  expect(runnerGate('card', true, refused)).toMatchObject({
    id: 'card',
    failure: null,
  });
  for (const step of ['save', 'result', 'test'] as const) {
    const failure = { step, reason: 'unavailable' } as const;
    expect(runnerGate('card', true, failure).failure).toEqual(failure);
  }
  const other = { step: 'run', reason: 'access' } as const;
  expect(runnerGate('card', true, other).failure).toEqual(other);
  expect(runnerGate('card', false, refused)).toMatchObject({
    id: undefined,
    failure: refused,
  });
  expect(runnerGate(undefined, true, refused).failure).toEqual(refused);
});

it('treats a failed checkpoint or the save before a retried run as unsaved', () => {
  const beforeRun = { step: 'save', reason: 'unavailable' } as const;
  expect(runnerGate('card', true, beforeRun).saveFailed).toBe(true);
  expect(runnerGate('card', true, null, 'failed').saveFailed).toBe(true);
  expect(
    runnerGate('card', true, { step: 'run', reason: 'unavailable' }, 'saved')
      .saveFailed
  ).toBe(false);
  expect(runnerGate('card', true, null).saveFailed).toBe(false);
});

it('names the language in full in the editor footer and flags read-only', () => {
  render(intl(<WorkbenchEditorStatus language="cpp" editable={false} />));
  const footer = screen.getByText('C++').closest('div')!;
  expect(footer.textContent).toContain(`${t.language}: C++`);
  expect(footer.textContent).toContain(t.readOnly);
});

it('disables runs only in meetings, only for a refused run, and reports it', () => {
  const onRunnerUnavailable = vi.fn();
  const { result } = renderHook(() =>
    useRunnerAvailability({ onRunnerUnavailable })
  );
  expect(result.current.unavailable).toBeUndefined();
  act(() =>
    result.current.onRunError(new WorkbenchStepError('save', unavailable))
  );
  expect(result.current.unavailable).toBeUndefined();
  act(() =>
    result.current.onRunError(Object.assign(new Error(), { status: 500 }))
  );
  expect(result.current.unavailable).toBeUndefined();
  act(() => result.current.onRunError(unavailable));
  expect(result.current.unavailable).toBeTruthy();
  expect(onRunnerUnavailable).toHaveBeenLastCalledWith(true);
  act(() => result.current.onRunStarted());
  expect(result.current.unavailable).toBeUndefined();
  expect(onRunnerUnavailable).toHaveBeenLastCalledWith(false);
});

it('follows the host app when it holds the state for the call', () => {
  const { result, rerender } = renderHook(
    (props: { runnerUnavailable: boolean }) => useRunnerAvailability(props),
    { initialProps: { runnerUnavailable: true } }
  );
  expect(result.current.unavailable).toBeTruthy();
  rerender({ runnerUnavailable: false });
  expect(result.current.unavailable).toBeUndefined();
  rerender({ runnerUnavailable: true });
  expect(result.current.unavailable).toBeTruthy();
});

it('never disables runs outside a meeting, so Learn keeps its retry notice', () => {
  const { result } = renderHook(() => useRunnerAvailability(undefined));
  act(() => result.current.onRunError(unavailable));
  expect(result.current.unavailable).toBeUndefined();
});
