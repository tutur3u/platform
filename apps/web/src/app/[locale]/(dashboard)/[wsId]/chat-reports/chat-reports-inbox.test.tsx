// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatReportsInbox } from './chat-reports-inbox';

const api = vi.hoisted(() => ({ list: vi.fn(), review: vi.fn() }));
vi.mock('@tuturuuu/internal-api/chat-reports', () => ({
  CHAT_REPORT_REASONS: [
    'spam',
    'harassment',
    'hate',
    'sexual',
    'violence',
    'impersonation',
    'self_harm',
    'harmful',
    'inaccurate',
    'other',
  ],
  listChatReports: api.list,
  reviewChatReport: api.review,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const report = {
  id: '22222222-2222-4222-8222-222222222222',
  subjectType: 'ai_response',
  reason: 'harmful',
  details: 'Reporter details',
  status: 'open',
  snapshot: {
    kind: 'ai_response',
    content: '<img src=x onerror=alert(1)> **reported reply**',
    model: 'synthetic-model',
    previousUserContent: 'What the user asked',
    messageCreatedAt: '2026-11-28T00:00:00Z',
  },
  wsId: null,
  conversationId: null,
  messageId: null,
  aiChatId: '33333333-3333-4333-8333-333333333333',
  aiChatMessageId: '44444444-4444-4444-8444-444444444444',
  reporterUserId: '55555555-5555-4555-8555-555555555555',
  reporterName: 'Reporter One',
  reportedUserId: null,
  reportedName: null,
  reviewedAt: null,
  resolutionNote: null,
  createdAt: '2026-11-28T01:00:00Z',
};

function setup() {
  api.list.mockResolvedValue({ reports: [report] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ChatReportsInbox actor="actor-one" />
    </QueryClientProvider>
  );
  return client;
}
afterEach(() => vi.resetAllMocks());

describe('chat report moderation inbox', () => {
  it('loads open reports and renders snapshot content as plain text', async () => {
    setup();
    expect(
      await screen.findByText(report.snapshot.content)
    ).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({ status: 'open', limit: 100 });
    expect(screen.getByText('What the user asked')).toBeInTheDocument();
    expect(screen.getByText('Reporter details')).toBeInTheDocument();
    expect(screen.getByText('Reporter One')).toBeInTheDocument();
    expect(screen.getByText('reason-harmful')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('strong')).toBeNull();
  });

  it('filters by status', async () => {
    setup();
    await screen.findByText(report.snapshot.content);
    fireEvent.click(screen.getByRole('button', { name: 'status-dismissed' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        status: 'dismissed',
        limit: 100,
      })
    );
  });

  it('submits a review with the note and refreshes the queue', async () => {
    setup();
    api.review.mockResolvedValue({ ok: true });
    await screen.findByText(report.snapshot.content);
    fireEvent.change(screen.getByPlaceholderText('note-placeholder'), {
      target: { value: 'Removed the reply' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'mark-actioned' }));
    await waitFor(() =>
      expect(api.review).toHaveBeenCalledWith({
        reportId: report.id,
        status: 'actioned',
        note: 'Removed the reply',
      })
    );
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('hides reported content when staff access is lost', async () => {
    const client = setup();
    await screen.findByText(report.snapshot.content);
    api.list.mockRejectedValue(new InternalApiError('forbidden', 403));
    await client.invalidateQueries({
      queryKey: ['chat-reports', 'actor-one', 'list'],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
    expect(screen.queryByText(report.snapshot.content)).not.toBeInTheDocument();
  });
});
