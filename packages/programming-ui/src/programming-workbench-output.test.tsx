// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { ProgrammingWorkbench } from './programming-workbench';
import type { WorkbenchExecution } from './use-workbench-run';
import type { WorkbenchMeeting } from './workbench-meeting';

vi.mock('./use-programming-room', () => {
  const client = {
    presence: vi.fn(),
    onLocalEdit: vi.fn(() => () => undefined),
  };
  return {
    useProgrammingRoom: () => ({
      client,
      ticket: {
        data: {
          project: { name: 'Demo', language: 'python' },
          role: 'owner',
          actorId: 'host',
        },
      },
      snapshot: {
        files: [{ path: 'main.py', content: 'print(42)' }],
        command: 'python3 main.py',
      },
      status: 'open',
      presence: [],
      saveError: false,
      savedRevision: null,
    }),
  };
});

vi.mock('./workbench-editor-stage', () => ({
  WorkbenchEditorStage: () => null,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const t = messages.programmingPlayground;

it.each(['run', 'test'] as const)(
  'reveals the output when you %s',
  async (action) => {
    const run = vi.fn(async () => ({ runId: 'run' }));
    const read: WorkbenchExecution['read'] = async () => ({
      runId: 'run',
      status: 'completed',
      exitCode: 0,
      output: '42',
      revision: 1,
      saved: true,
    });
    const runTests = vi.fn(async () => ({
      submissionId: 'test',
      output: 'Test output',
      cases: [],
    }));
    const meeting: WorkbenchMeeting = {
      collapsibleOutput: true,
      runTests: action === 'test' ? runTests : undefined,
      mira: {
        presence: null,
        manage: false,
        pending: false,
        onAction: vi.fn(),
      },
    };
    const problem =
      action === 'test'
        ? { title: 'Demo Problem', prompt: 'Print 42.' }
        : undefined;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <ProgrammingWorkbench
            projectId="demo"
            execution={{ run, read }}
            checkpoint={async () => undefined}
            meeting={meeting}
            problem={problem}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );

    const disclosure = screen.getByRole('button', { name: t.outputPanes });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tabpanel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t[action] }));

    const current = action === 'run' ? t.console : t.tests;
    expect(await screen.findByRole('tabpanel', { name: current })).toBeTruthy();
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByRole('tab', { name: current, selected: true })
    ).toBeTruthy();
    if (action === 'run') {
      await waitFor(() =>
        expect(run).toHaveBeenCalledWith(
          expect.objectContaining({ operation: 'run' })
        )
      );
    } else {
      await waitFor(() => expect(runTests).toHaveBeenCalledWith('print(42)'));
    }
  }
);

it('closes the share dialog when the workbench is suspended', () => {
  const client = new QueryClient();
  const view = (suspended: boolean) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProgrammingWorkbench projectId="demo" suspended={suspended} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );

  const { rerender } = render(view(false));
  fireEvent.keyDown(screen.getByRole('button', { name: t.more }), {
    key: 'Enter',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: t.share }));
  expect(screen.getByRole('dialog', { name: t.share })).toBeTruthy();

  rerender(view(true));
  expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
});
