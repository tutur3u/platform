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
import messages from '../../../../messages/en.json';
import { ConversationPanel } from './conversation-panel';

vi.mock('@tuturuuu/internal-api', () => ({
  listMeetAssistantReviews: async () => [],
  askMeetAssistant: vi.fn(),
}));
vi.mock('./personal-chat', () => ({
  PersonalChat: () => (
    <textarea aria-label="Private draft" defaultValue="Private text" />
  ),
}));
vi.mock('./assistant-workspace-picker', () => ({
  AssistantWorkspacePicker: () => null,
}));
vi.mock('./mira-profile', () => ({
  MiraAvatar: () => null,
  MiraProfile: () => null,
}));
vi.mock('./assistant-private-review', () => ({
  AssistantPrivateReview: () => null,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('opens Everyone, preserves drafts, inserts one mention and focuses after opening or repeated requests', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    setTimeout(callback, 0)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  Element.prototype.scrollIntoView = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handled = vi.fn();
  const view = (request: number) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConversationPanel
          solo
          meetingId="meeting"
          selfUserId="self"
          chat={[]}
          onSendChat={vi.fn()}
          mentionRequest={request}
          onMentionHandled={handled}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view(0));
  fireEvent.change(screen.getByRole('textbox', { name: 'Chat' }), {
    target: { value: 'Keep my question' },
  });
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Private Mira' }), {
    button: 0,
    ctrlKey: false,
  });
  rerender(view(1));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Chat' })
    )
  );
  expect(
    (screen.getByRole('textbox', { name: 'Chat' }) as HTMLTextAreaElement).value
  ).toBe('@mira Keep my question');
  rerender(view(2));
  await waitFor(() => expect(handled).toHaveBeenCalledTimes(2));
  expect(
    (screen.getByRole('textbox', { name: 'Chat' }) as HTMLTextAreaElement).value
  ).toBe('@mira Keep my question');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Private Mira' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Private draft',
      }) as HTMLTextAreaElement
    ).value
  ).toBe('Private text');
  client.clear();
});
