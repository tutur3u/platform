// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Awareness, Y } from '@tuturuuu/realtime/documents';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { DocumentEditor } from './document-panel';

vi.mock('@tuturuuu/realtime/channels', () => ({ RealtimeChannel: class {} }));
const providers = vi.hoisted(() => ({ awareness: [] as Awareness[] }));
vi.mock('@tuturuuu/realtime/documents', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/realtime/documents')>();
  return {
    ...actual,
    CloudflareDocumentProvider: class {
      awareness: Awareness;
      constructor(
        doc: Y.Doc,
        _channel: unknown,
        connected: (value: boolean) => void,
        checkpoint: (value: string) => void
      ) {
        this.awareness = new actual.Awareness(doc);
        providers.awareness.push(this.awareness);
        connected(true);
        checkpoint('deferred');
      }
      async destroy() {
        this.awareness.destroy();
      }
    },
  };
});
vi.mock('@tuturuuu/ui/text-editor/editor', () => ({
  RichTextEditor: ({
    toolbarLeadingContent,
    toolbarToolsLabel,
    allowCollaboration,
    yjsDoc,
    yjsProvider,
  }: {
    toolbarLeadingContent: ReactNode;
    toolbarToolsLabel: string;
    allowCollaboration?: boolean;
    yjsDoc?: unknown;
    yjsProvider?: unknown;
  }) => (
    <div
      data-testid="editor"
      data-shared={String(
        allowCollaboration === true && !!yjsDoc && !!yjsProvider
      )}
    >
      <div role="toolbar">
        {toolbarLeadingContent}
        <button type="button">{toolbarToolsLabel}</button>
      </div>
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  for (const state of providers.awareness.splice(0)) state.destroy();
});

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
  expect(screen.getByTestId('editor').getAttribute('data-shared')).toBe('true');
  const toolbar = screen.getByRole('toolbar');
  expect(
    within(toolbar).getByRole('button', {
      name: messages.meet.collaboration.checkpoint_deferred,
    })
  ).toBeTruthy();
  expect(within(toolbar).getByRole('button', { name: 'Tools' })).toBeTruthy();
  expect(within(toolbar).getByLabelText('Participant')).toBeTruthy();
  const wrapper = screen.getByTestId('editor').parentElement;
  expect(wrapper?.className).not.toMatch(/\bp-4\b|\bpx-4\b/);
  expect(container.querySelector('section')?.className).not.toMatch(
    /\bp-4\b|\bpx-4\b/
  );
});
