// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { MiraAskMenu, MiraEditorBar } from './mira-code-presence';
import { WorkbenchFiles } from './workbench-files';
import { WorkbenchMeetingOutput } from './workbench-meeting-output';
import { WorkbenchOutput } from './workbench-output';
import { WorkbenchToolbar } from './workbench-toolbar';

afterEach(cleanup);
const t = messages.programmingPlayground;
const intl = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {node}
  </NextIntlClientProvider>
);

function toolbar(meeting = true, onRuntime?: () => void) {
  return render(
    intl(
      <WorkbenchToolbar
        title="Java playground"
        language="java"
        status="open"
        participants={['Lan']}
        controls={{ kind: 'none' }}
        actions={[]}
        meeting={meeting ? { onRuntime } : undefined}
      />
    )
  );
}

it('shows the activity name and editors once, without repeating the pane header', () => {
  const { container } = toolbar(true, vi.fn());
  expect(screen.getByText('Java playground')).toBeTruthy();
  expect(screen.getByText('1 editing')).toBeTruthy();
  // The pane header already says Co-programming, with its icon.
  expect(screen.queryByText(t.coding)).toBeNull();
  expect(
    container.querySelector('.lucide-code-xml, [data-icon="code-xml"]')
  ).toBeNull();
});

it('puts Format in the toolbar for the open file', () => {
  render(
    intl(
      <WorkbenchToolbar
        title="Java playground"
        language="java"
        status="open"
        participants={[]}
        controls={{ kind: 'none' }}
        actions={[]}
        format={{
          support: { supported: false, reason: 'rust' },
          editable: true,
          pending: false,
          onFormat: vi.fn(),
        }}
      />
    )
  );
  expect(screen.getByRole('button', { name: t.format })).toBeTruthy();
});

it('keeps the runtime in one control, read-only for people who cannot switch it', () => {
  toolbar(true);
  expect(screen.getAllByText('Java')).toHaveLength(1);
  expect(screen.getByTitle(t.languageHostOnly)).toBeTruthy();
});

it('does not badge the active file tab with the runtime', () => {
  render(
    intl(
      <WorkbenchFiles
        files={['Main.java']}
        active="Main.java"
        onSelect={vi.fn()}
      />
    )
  );
  expect(screen.getByRole('tab').textContent).toBe('Main.java');
});

it('puts a trailing action on the file tab row instead of its own row', () => {
  render(
    intl(
      <WorkbenchFiles
        files={['Main.java']}
        active="Main.java"
        onSelect={vi.fn()}
        trailing={<button type="button">Ask Mira</button>}
      />
    )
  );
  const row = screen.getByRole('tablist').parentElement!;
  expect(row.contains(screen.getByRole('button', { name: 'Ask Mira' }))).toBe(
    true
  );
});

const mira = {
  presence: null,
  voiceDraft: null,
  manage: true,
  pending: false,
  error: undefined,
  onAction: vi.fn(),
} as never;

it('renders Mira status only when it has something to say, and the menu apart from it', () => {
  const { container } = render(intl(<MiraEditorBar mira={mira} />));
  expect(container.firstChild).toBeNull();
  cleanup();
  render(intl(<MiraAskMenu mira={mira} editable onAnalyze={vi.fn()} />));
  expect(
    screen.getByRole('button', { name: new RegExp(t.miraReview) })
  ).toBeTruthy();
});

const view = { text: '', exitCode: null, running: false };
const run = {
  command: 'javac Main.java && java Main',
  onCommand: vi.fn(),
  stdin: '',
  onStdin: vi.fn(),
  editable: true,
};

it('keeps the save status to the checkpoint row inside the meeting output', () => {
  render(
    intl(
      <WorkbenchMeetingOutput
        view={view}
        save="saved"
        run={run}
        tab="console"
        onTab={vi.fn()}
        testing={false}
        canTest={false}
        checkpoint={{ pending: false, save: vi.fn(), state: 'saved' }}
      />
    )
  );
  // One Saved to Drive: the checkpoint row, not a second line beside the console.
  expect(screen.getAllByText(t.saved)).toHaveLength(1);
});

it('still shows the save state in the standalone console', () => {
  render(
    intl(
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={{ ...view, text: 'x', exitCode: 0 }}
        save="saved"
        run={run}
      />
    )
  );
  expect(screen.getByText(t.saved)).toBeTruthy();
});

it('drops the output placeholder while runs are unavailable', () => {
  const unavailable = render(
    intl(
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={view}
        save="idle"
        run={run}
        embedded
        runnerUnavailable
      />
    )
  );
  expect(screen.queryByText(t.outputEmpty)).toBeNull();
  expect(unavailable.container.querySelector('pre')).toBeNull();
  cleanup();
  render(
    intl(
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={view}
        save="idle"
        run={run}
        embedded
      />
    )
  );
  expect(screen.getByText(t.outputEmpty)).toBeTruthy();
});

it('keeps real output visible even when runs are unavailable', () => {
  render(
    intl(
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={{ ...view, text: 'old output', exitCode: 0 }}
        save="idle"
        run={run}
        embedded
        runnerUnavailable
      />
    )
  );
  expect(screen.getByText('old output')).toBeTruthy();
});
