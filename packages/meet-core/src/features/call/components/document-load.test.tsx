// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import type { Awareness, Y } from '@tuturuuu/realtime/documents';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { DocumentWorkspace } from './document-workspace';

const api = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn() }));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  getMeetDocument: api.get,
  listMeetDocuments: api.list,
  updateMeetDocuments: vi.fn(),
}));
vi.mock('@tuturuuu/realtime/channels', () => ({ RealtimeChannel: class {} }));
vi.mock('@tuturuuu/realtime/documents', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/realtime/documents')>();
  return {
    ...actual,
    CloudflareDocumentProvider: class {
      awareness: Awareness;
      constructor(doc: Y.Doc) {
        this.awareness = new actual.Awareness(doc);
      }
      async destroy() {
        this.awareness.destroy();
      }
    },
  };
});

vi.mock('@tuturuuu/ui/text-editor/editor', () => ({
  RichTextEditor: () => <div data-testid="document-editor" />,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const initial = {
  documentId: 'fixture-id',
  revision: 0,
  endpoint: 'wss://meet.example.invalid',
  token: 'fixture-ticket',
  role: 'editor',
  state: [],
  user: { id: 'fixture-user', user_metadata: { display_name: 'Guest' } },
};

function workspace(onRequestAccess?: () => Promise<unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
  api.list.mockResolvedValue({ tabs: [] });
  const view = (admitted: boolean) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>
          <DocumentWorkspace
            admitted={admitted}
            accountId="fixture-user"
            meetingId="fixture-meeting"
            onRequestAccess={onRequestAccess}
          />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { view };
}

it('waits for admission before starting either request and recovers from a transient join failure', async () => {
  api.get
    .mockRejectedValueOnce(new InternalApiError('fixture', 503))
    .mockResolvedValueOnce(initial);
  const { view } = workspace();
  const { rerender } = render(view(false));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.collaboration.connecting
  );
  expect(api.list).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalled();

  rerender(view(true));
  await screen.findByTestId('document-editor');
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.list).toHaveBeenCalledTimes(1);
});

it('shows a permission reason, sends the request once and lets the user retry', async () => {
  const request = vi.fn().mockResolvedValue(undefined);
  api.get
    .mockRejectedValueOnce(new InternalApiError('fixture', 403))
    .mockResolvedValueOnce(initial);
  const { view } = workspace(request);
  render(view(true));
  await screen.findByText(messages.meet.collaboration.unavailable_permission);
  expect(api.get).toHaveBeenCalledTimes(1);
  const action = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Request access',
  });
  fireEvent.click(action);
  await screen.findByText(messages.meet.collaboration.document_request_sent);
  expect(action.disabled).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByTestId('document-editor');
});

it('reports a missing document without asking the host for access', async () => {
  api.get.mockRejectedValue(new InternalApiError('fixture', 404));
  const { view } = workspace(vi.fn());
  render(view(true));
  await screen.findByText(messages.meet.collaboration.unavailable_missing);
  expect(screen.queryByRole('button', { name: 'Request access' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
