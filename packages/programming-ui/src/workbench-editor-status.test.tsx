// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import type { DiagnosticsStatus } from './code-diagnostics';
import { WorkbenchEditorStatus } from './workbench-editor-status';

afterEach(cleanup);
const t = messages.programmingPlayground;

function ui(diagnostics?: DiagnosticsStatus) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchEditorStatus
        language="cpp"
        editable
        diagnostics={diagnostics}
      />
    </NextIntlClientProvider>
  );
}
function footer(diagnostics?: DiagnosticsStatus) {
  render(ui(diagnostics));
  return screen.getByRole('status');
}

it('shows and announces whether problems were found, paused or too large', () => {
  for (const [status, text] of [
    [{ kind: 'ready', problems: 2 }, '2 problems'],
    [{ kind: 'ready', problems: 0 }, 'No problems'],
    [{ kind: 'paused' }, t.diagnosticsPaused],
    [{ kind: 'tooLarge' }, t.diagnosticsTooLarge],
  ] as const) {
    expect(footer(status).textContent).toBe(text);
    expect(screen.getAllByText(text)).toHaveLength(2);
    cleanup();
  }
});

it('shows Checking only visually and keeps the last announcement meanwhile', () => {
  const { rerender } = render(ui({ kind: 'ready', problems: 2 }));
  const live = screen.getByRole('status');
  expect(live.textContent).toBe('2 problems');
  rerender(ui({ kind: 'checking' }));
  expect(screen.getByText(t.diagnosticsChecking)).toBeTruthy();
  expect(live.textContent).toBe('2 problems');
  rerender(ui({ kind: 'ready', problems: 2 }));
  expect(live.textContent).toBe('2 problems');
  rerender(ui({ kind: 'ready', problems: 1 }));
  expect(live.textContent).toBe('1 problem');
  cleanup();
  expect(footer({ kind: 'checking' }).textContent).toBe('');
});

it('shows nothing about problems where no checker applies', () => {
  expect(footer().textContent).toBe('');
  cleanup();
  expect(footer({ kind: 'off' }).textContent).toBe('');
});
