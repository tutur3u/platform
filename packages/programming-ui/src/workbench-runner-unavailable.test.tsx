// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { useRunnerAvailability } from './use-runner-availability';
import { WorkbenchEditorStatus } from './workbench-editor-status';
import { WorkbenchStepError } from './workbench-errors';
import { WorkbenchMeetingOutput } from './workbench-meeting-output';
import { WorkbenchToolbar } from './workbench-toolbar';

afterEach(cleanup);
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

function toolbar(runnerUnavailable?: string) {
  return render(
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
            onRun: vi.fn(),
            onStop: vi.fn(),
            unavailable: runnerUnavailable,
          }}
        />
        {runnerUnavailable && <p id={runnerUnavailable}>card</p>}
      </>
    )
  );
}

it('keeps Run visible but disabled and described by the runner card', () => {
  toolbar('runner-card');
  const run = screen.getByRole('button', { name: new RegExp(t.run) });
  expect(run.hasAttribute('disabled')).toBe(true);
  expect(run.getAttribute('aria-describedby')).toBe('runner-card');
  expect(
    screen.getByRole('button', { name: t.stop }).hasAttribute('disabled')
  ).toBe(true);
});

it('leaves Run enabled with no description while the runner is ready', () => {
  toolbar();
  const run = screen.getByRole('button', { name: new RegExp(t.run) });
  expect(run.hasAttribute('disabled')).toBe(false);
  expect(run.hasAttribute('aria-describedby')).toBe(false);
});

it('shows non-hosts the room language as a read-only chip in the toolbar', () => {
  toolbar();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.getByTitle(t.languageHostOnly).textContent).toContain('Python');
});

it('explains the unavailable runner above every output tab with what still works', async () => {
  const onRetry = vi.fn();
  const writeText = vi.fn(async () => undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  const createObjectURL = vi.fn(() => 'blob:code');
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  const { rerender } = render(
    intl(
      <WorkbenchMeetingOutput
        tab="console"
        onTab={vi.fn()}
        view={{ text: '', running: false, exitCode: null }}
        save="idle"
        testing={false}
        canTest={false}
        runner={{ id: 'runner-card', file, onRetry, retrying: false }}
      />
    )
  );
  const card = screen.getByRole('status');
  expect(card.id).toBe('runner-card');
  expect(card.textContent).toContain(t.runnerUnavailableTitle);
  expect(card.textContent).toContain(t.runnerUnavailableBody);
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: t.copyCode }));
  expect(writeText).toHaveBeenCalledWith(file.content);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: t.codeCopied })).toBeTruthy()
  );

  fireEvent.click(screen.getByRole('button', { name: 'Download main.py' }));
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:code');

  fireEvent.click(screen.getByRole('button', { name: t.retry }));
  expect(onRetry).toHaveBeenCalledOnce();

  rerender(
    intl(
      <WorkbenchMeetingOutput
        tab="preview"
        onTab={vi.fn()}
        view={{ text: '', running: false, exitCode: null }}
        save="idle"
        testing={false}
        canTest={false}
        runner={{ id: 'runner-card', file, onRetry, retrying: true }}
      />
    )
  );
  expect(screen.getByText(t.runnerUnavailableTitle)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: t.retry }).hasAttribute('disabled')
  ).toBe(true);
  click.mockRestore();
});

it('names the language in full in the editor footer and flags read-only', () => {
  render(intl(<WorkbenchEditorStatus language="cpp" editable={false} />));
  const footer = screen.getByRole('contentinfo');
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

it('starts disabled when the call already saw the runner refuse a run', () => {
  const { result } = renderHook(() =>
    useRunnerAvailability({ runnerUnavailable: true })
  );
  expect(result.current.unavailable).toBeTruthy();
});

it('never disables runs outside a meeting, so Learn keeps its retry notice', () => {
  const { result } = renderHook(() => useRunnerAvailability(undefined));
  act(() => result.current.onRunError(unavailable));
  expect(result.current.unavailable).toBeUndefined();
});
