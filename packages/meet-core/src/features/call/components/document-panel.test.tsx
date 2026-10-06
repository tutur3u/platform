// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { DocumentEditor } from './document-panel';

vi.mock('@tuturuuu/realtime/channels', () => ({ RealtimeChannel: class {} }));
vi.mock('@tuturuuu/realtime/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/realtime/documents')>()),
  CloudflareDocumentProvider: class {
    awareness = { setLocalStateField: vi.fn() };
    constructor(
      _doc: unknown,
      _channel: unknown,
      connected: (value: boolean) => void,
      checkpoint: (value: string) => void
    ) {
      connected(true);
      checkpoint('deferred');
    }
    async destroy() {}
  },
}));
vi.mock('@tuturuuu/ui/text-editor/editor', () => ({
  RichTextEditor: ({
    toolbarLeadingContent,
    toolbarToolsLabel,
  }: {
    toolbarLeadingContent: ReactNode;
    toolbarToolsLabel: string;
  }) => (
    <div data-testid="editor">
      <div role="toolbar">
        {toolbarLeadingContent}
        <button type="button">{toolbarToolsLabel}</button>
      </div>
    </div>
  ),
}));
afterEach(cleanup);

it('places backup feedback in the editor toolbar without a padded title wrapper', () => {
  const initial: Parameters<typeof DocumentEditor>[0]['initial'] = {
    documentId: 'synthetic-document',
    revision: 0,
    endpoint: 'https://realtime.example.invalid',
    token: 'synthetic-test-token',
    role: 'editor',
    state: [],
    user: {
      id: 'synthetic-actor',
      user_metadata: { display_name: 'Participant' },
    },
  };
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TooltipProvider>
        <DocumentEditor meetingId="synthetic-room" initial={initial} />
      </TooltipProvider>
    </NextIntlClientProvider>
  );
  expect(screen.queryByText(messages.meet.collaboration.document)).toBeNull();
  const toolbar = screen.getByRole('toolbar');
  expect(
    within(toolbar).getByRole('button', {
      name: messages.meet.collaboration.checkpoint_deferred,
    })
  ).toBeTruthy();
  expect(within(toolbar).getByRole('button', { name: 'Tools' })).toBeTruthy();
  const wrapper = screen.getByTestId('editor').parentElement;
  expect(wrapper?.className).not.toMatch(/\bp-4\b|\bpx-4\b/);
  expect(container.querySelector('section')?.className).not.toMatch(
    /\bp-4\b|\bpx-4\b/
  );
});
