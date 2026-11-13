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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import english from '../../../../../../apps/meet/messages/en.json';
import vietnamese from '../../../../../../apps/meet/messages/vi.json';
const f = vi.hoisted(() => ({ ask: vi.fn(), toast: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  askMeetAssistant: f.ask,
  listMeetAssistantReviews: async () => [],
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: f.toast } }));
vi.mock('./assistant-workspace-picker', () => ({
  AssistantWorkspacePicker: () => null,
  isCurrentAssistantWorkspace: () => true,
  useAssistantWorkspaceSelection: () => ({
    allowed: true,
    value: 'personal',
    actor: null,
  }),
}));
vi.mock('./mira-profile', () => ({
  MiraAvatar: () => null,
  MiraProfile: () => null,
}));
vi.mock('./assistant-private-review', () => ({
  AssistantPrivateReview: () => null,
}));
import { ChatPanel } from './chat-panel';
beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
function show(locale: 'en' | 'vi') {
  const messages = locale === 'en' ? english : vietnamese;
  const send = vi.fn().mockResolvedValue({ id: 'synthetic-message' });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale={locale}
        timeZone="UTC"
        messages={messages}
      >
        <ChatPanel
          chat={[]}
          onSendChat={send}
          selfUserId="synthetic-device"
          accountId="synthetic-account"
          meetingId="synthetic-meeting"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { send, text: messages.meet.call };
}
for (const locale of ['en', 'vi'] as const)
  for (const mention of ['@mira', '@ttr', '@Tuturuuu'])
    it(`shows an in-chat ${locale} refusal for ${mention} after a server 403`, async () => {
      f.ask.mockRejectedValue(
        Object.assign(new Error('Synthetic denial'), { status: 403 })
      );
      const { send, text } = show(locale);
      fireEvent.change(screen.getByRole('textbox', { name: text.chat }), {
        target: { value: `${mention} hello` },
      });
      fireEvent.click(screen.getByRole('button', { name: text.send }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        text.assistant_private_only
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(`${mention} hello`, []);
      expect(f.ask).toHaveBeenCalledTimes(1);
      expect(f.toast).not.toHaveBeenCalled();
    });
it('does not label a transport failure as an intentional room denial', async () => {
  f.ask.mockRejectedValue(new Error('Synthetic network failure'));
  const { text } = show('en');
  fireEvent.change(screen.getByRole('textbox', { name: text.chat }), {
    target: { value: '@mira hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: text.send }));
  await waitFor(() =>
    expect(f.toast).toHaveBeenCalledWith(text.assistant_failed)
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
