// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailComposerAi } from './mail-composer-ai';

const generate = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api', () => ({ generateMailAiDraft: generate }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);
it('keeps an in-flight generation pending and rejects its stale result after editing', async () => {
  let finish!: (result: unknown) => void;
  generate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const query = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const view = (bodyText: string) =>
    h(
      QueryClientProvider,
      { client: query },
      h(MailComposerAi, {
        bodyHtml: '',
        bodyText,
        mailboxId: 'mailbox',
        workspaceId: 'personal',
        subject: 'Subject',
        recipients: [],
        onApply: vi.fn(),
        onOpenChange: vi.fn(),
        open: true,
        selectionOnly: true,
      })
    );
  const rendered = render(view('First passage'));
  fireEvent.click(screen.getByText('ai_quick_polish'));
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  rendered.rerender(view('Changed passage'));
  expect(
    (screen.getByText('ai_quick_polish') as HTMLButtonElement).disabled
  ).toBe(true);
  fireEvent.click(screen.getByText('ai_quick_polish'));
  expect(generate).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({
      subject: 'Subject',
      content: 'Stale replacement',
      tone: 'professional',
      suggestions: [],
    });
  });
  await waitFor(() =>
    expect(
      (screen.getByText('ai_quick_polish') as HTMLButtonElement).disabled
    ).toBe(false)
  );
  expect(screen.queryByText('Stale replacement')).toBeNull();
  expect(
    (screen.getByText('replace_selection') as HTMLButtonElement).disabled
  ).toBe(true);
});
