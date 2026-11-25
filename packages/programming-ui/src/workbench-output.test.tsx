// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PLAYGROUND_STDIN_MAX_LENGTH } from '@tuturuuu/types/primitives/playgrounds';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { useOutputDisclosure } from './use-output-disclosure';
import { WorkbenchMeetingOutput } from './workbench-meeting-output';
import { WorkbenchOutput } from './workbench-output';

afterEach(cleanup);
const t = messages.programmingPlayground;
type Props = Parameters<typeof WorkbenchOutput>[0];
function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    onToggle: vi.fn(),
    view: { text: '', exitCode: null, running: false },
    save: 'idle',
    run: {
      command: 'python3 main.py',
      onCommand: vi.fn(),
      stdin: '',
      onStdin: vi.fn(),
      editable: true,
    },
    ...overrides,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput {...props} />
    </NextIntlClientProvider>
  );
  return { ...view, props };
}

it('shows an explicit empty state instead of a blank or broken pane', () => {
  const { container } = mount();
  expect(screen.getByText(t.outputEmpty)).toBeTruthy();
  expect(container.querySelector('iframe')).toBeNull();
  // The retired helper copy must not come back as literal text.
  expect(screen.queryByText(/save in the background/i)).toBeNull();
  expect(screen.queryByText(/Background saves write/i)).toBeNull();
});

it('limits stdin to the run request budget', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: t.stdin }));
  expect(
    screen.getByRole('textbox', { name: t.stdin }).getAttribute('maxlength')
  ).toBe(String(PLAYGROUND_STDIN_MAX_LENGTH));
});

it('shows real run output with its exit code and the save state', () => {
  mount({
    view: { text: 'Hello World!\n', exitCode: 0, running: false },
    save: 'saved',
  });
  expect(screen.getByText(/Hello World!/).tagName).toBe('PRE');
  expect(screen.getByText('Exited with code 0')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe(t.saved);
});

it('collapses to a single header row and keeps the command editable there', () => {
  const { container, props } = mount({ open: false });
  expect(screen.queryByText(t.outputEmpty)).toBeNull();
  expect(container.querySelector('pre')).toBeNull();
  const toggle = screen.getByRole('button', { name: t.console });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(props.onToggle).toHaveBeenCalled();
  const command = screen.getByLabelText(t.command) as HTMLInputElement;
  expect(command.value).toBe('python3 main.py');
  fireEvent.change(command, { target: { value: 'python3 app.py' } });
  expect(props.run?.onCommand).toHaveBeenCalledWith('python3 app.py');
});

it('renders the preview frame only for a valid opted-in port', () => {
  const url = vi.fn((port: number) => `/preview/${port}/`);
  const { container, rerender } = mount({
    preview: { port: '80', onPort: vi.fn(), url, onClose: vi.fn() },
  });
  expect(container.querySelector('iframe')).toBeNull();
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={{ text: '', exitCode: null, running: false }}
        save="idle"
        preview={{ port: '3000', onPort: vi.fn(), url, onClose: vi.fn() }}
      />
    </NextIntlClientProvider>
  );
  const frame = container.querySelector('iframe');
  expect(frame?.getAttribute('src')).toBe('/preview/3000/');
  expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  expect(screen.getByRole('button', { name: t.previewClose })).toBeTruthy();
});

it('names the failed step, what is still safe, and retries it', () => {
  const onRetry = vi.fn();
  mount({
    failure: { step: 'save', reason: 'busy' },
    onRetry,
  });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain(t.failureStep.save);
  expect(alert.textContent).toContain(t.failureReason.busy);
  expect(alert.textContent).toContain(t.failureSafe);
  expect(alert.textContent).not.toContain(t.failed);
  fireEvent.click(screen.getByRole('button', { name: t.retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it('summarizes a finished run with its exit status and duration', () => {
  mount({
    view: { text: 'boom\n', exitCode: 1, running: false },
    durationMs: 420,
  });
  expect(screen.getByText('Exited with code 1')).toBeTruthy();
  expect(screen.getByText('0.42 s')).toBeTruthy();
});

it('renders real public test failures and jumps to the linked editor line', () => {
  const jump = vi.fn();
  const selectTab = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchMeetingOutput
        tab="tests"
        onTab={selectTab}
        test={{
          submissionId: 'submission',
          output: '',
          cases: [
            { index: 0, passed: true, reason: 'passed' },
            {
              index: 1,
              passed: false,
              reason: 'runtime_error',
              stderr: 'AssertionError: expected 2',
            },
          ],
        }}
        view={{ text: '', running: false, exitCode: null }}
        save="idle"
        testing={false}
        canTest
        failureLink={{ index: 1, line: 19, jump }}
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('1 failed')).toBeTruthy();
  expect(screen.getByText('AssertionError: expected 2')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Mira linked this failure to line 19' })
  );
  expect(jump).toHaveBeenCalledOnce();
  fireEvent.keyDown(screen.getByRole('tab', { name: /Tests/ }), {
    key: 'ArrowRight',
  });
  expect(selectTab).toHaveBeenCalledWith('console');
});

const note = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('output')).find((node) =>
    node.className.includes('block text-muted-foreground')
  );

it('keeps one live region for the sandbox note: absent outside a meeting, empty, then filled', () => {
  const { container, rerender, props } = mount({
    view: { text: '', exitCode: null, running: true },
  });
  expect(note(container)).toBeUndefined();
  const render = (slowStart: boolean) =>
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WorkbenchOutput
          {...props}
          view={{ text: '', exitCode: null, running: true, slowStart }}
        />
      </NextIntlClientProvider>
    );
  render(false);
  const region = note(container);
  expect(region).toBeTruthy();
  expect(region?.textContent).toBe('');
  render(true);
  // The same node receives the text; it is not re-inserted.
  expect(note(container)).toBe(region);
  expect(region?.textContent).toBe(t.sandboxSlowStart);
});

it('silences the runner status line only while the sandbox note is showing', () => {
  const { container, rerender, props } = mount({
    view: { text: '', exitCode: null, running: true, slowStart: false },
  });
  const status = () =>
    Array.from(container.querySelectorAll('output')).find((node) =>
      node.className.includes('truncate')
    );
  expect(status()?.getAttribute('aria-live')).toBeNull();
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput
        {...props}
        view={{ text: '', exitCode: null, running: true, slowStart: true }}
      />
    </NextIntlClientProvider>
  );
  expect(status()?.getAttribute('aria-live')).toBe('off');
});

function MeetingOutput({ tab }: { tab: 'tests' | 'console' | 'preview' }) {
  const disclosure = useOutputDisclosure(true);
  return (
    <WorkbenchMeetingOutput
      disclosure={disclosure}
      tab={tab}
      onTab={() => undefined}
      view={{ text: 'Program output', exitCode: 0, running: false }}
      save="idle"
      testing={false}
      canTest
    />
  );
}

const mountMeetingOutput = (tab: 'tests' | 'console' | 'preview') =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingOutput tab={tab} />
    </NextIntlClientProvider>
  );

it.each(['tests', 'console', 'preview'] as const)(
  'starts with the Meet %s panel collapsed without a saved preference',
  (tab) => {
    localStorage.clear();
    mountMeetingOutput(tab);
    expect(
      screen.getByRole('button', { name: t.outputPanes }).getAttribute(
        'aria-expanded'
      )
    ).toBe('false');
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.queryByText('Program output')).toBeNull();
  }
);

it('remembers the output disclosure across workbench mounts', () => {
  localStorage.clear();
  try {
    const first = mountMeetingOutput('console');
    const toggle = () => screen.getByRole('button', { name: t.outputPanes });
    fireEvent.click(toggle());
    expect(screen.getByText('Program output')).toBeTruthy();
    first.unmount();

    const second = mountMeetingOutput('console');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle());
    second.unmount();

    mountMeetingOutput('tests');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tabpanel')).toBeNull();
  } finally {
    localStorage.clear();
  }
});
