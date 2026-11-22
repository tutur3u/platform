// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import type { DiagnosticsStatus } from './code-diagnostics';
import { WorkbenchEditorStatus } from './workbench-editor-status';

afterEach(cleanup);
const t = messages.programmingPlayground;

function footer(diagnostics?: DiagnosticsStatus) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchEditorStatus
        language="cpp"
        editable
        diagnostics={diagnostics}
      />
    </NextIntlClientProvider>
  );
  return screen.getByRole('status');
}

it('says whether problems are being checked, found or paused', () => {
  expect(footer({ kind: 'checking' }).textContent).toBe(t.diagnosticsChecking);
  cleanup();
  expect(footer({ kind: 'ready', problems: 2 }).textContent).toBe('2 problems');
  cleanup();
  expect(footer({ kind: 'ready', problems: 0 }).textContent).toBe(
    'No problems'
  );
  cleanup();
  expect(footer({ kind: 'paused' }).textContent).toBe(t.diagnosticsPaused);
  cleanup();
  expect(footer({ kind: 'tooLarge' }).textContent).toBe(t.diagnosticsTooLarge);
});

it('shows nothing about problems where no checker applies', () => {
  expect(footer().textContent).toBe('');
  cleanup();
  expect(footer({ kind: 'off' }).textContent).toBe('');
});
