// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WorkspacePeopleSearchResponse } from '@tuturuuu/internal-api/people';
import { createElement as h, Fragment, type PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailSenderContactCard } from './mail-sender-contact-card';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: mocks.search,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/popover', () => ({
  Popover: ({ children }: PropsWithChildren) => h(Fragment, null, children),
  PopoverTrigger: ({ children }: PropsWithChildren) =>
    h(Fragment, null, children),
  PopoverContent: ({ children }: PropsWithChildren) => h('div', null, children),
}));
afterEach(() => {
  cleanup();
  mocks.search.mockReset();
});

function setup(address = 'SENDER@example.com') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    h(
      QueryClientProvider,
      { client },
      h(MailSenderContactCard, {
        workspaceId: 'workspace-1',
        address,
        name: 'Message sender',
      })
    )
  );
}

it('looks up only after focus and links only exact visible-email contact matches', async () => {
  const response: WorkspacePeopleSearchResponse = {
    data: [
      {
        kind: 'contact',
        id: 'contact-1',
        linkedUserId: null,
        displayName: 'Visible contact',
        email: 'sender@EXAMPLE.com',
        avatarUrl: null,
      },
      {
        kind: 'contact',
        id: 'hidden-1',
        linkedUserId: null,
        displayName: 'Hidden email',
        email: null,
        avatarUrl: null,
      },
      {
        kind: 'contact',
        id: 'substring-1',
        linkedUserId: null,
        displayName: 'Different sender',
        email: 'other-sender@example.com',
        avatarUrl: null,
      },
    ],
  };
  mocks.search.mockResolvedValue(response);
  setup();
  expect(mocks.search).not.toHaveBeenCalled();
  fireEvent.focus(screen.getByRole('button', { name: 'show' }));
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'open' })).toBeTruthy()
  );
  expect(mocks.search).toHaveBeenCalledWith('workspace-1', {
    query: 'sender@example.com',
    limit: 20,
  });
  expect(
    screen.getByRole('link', { name: 'open' }).getAttribute('href')
  ).toMatch(/\/en\/workspace-1\/users\/database\/contact-1$/u);
  expect(screen.queryByText('Hidden email')).toBeNull();
  expect(screen.queryByText('Different sender')).toBeNull();
  expect(screen.getAllByText('Message sender').length).toBeGreaterThan(0);
});

it('treats an empty bounded search as inconclusive', async () => {
  mocks.search.mockResolvedValue({ data: [] });
  setup();
  fireEvent.focus(screen.getByRole('button', { name: 'show' }));
  await waitFor(() =>
    expect(screen.getByText('no_visible_match')).toBeTruthy()
  );
  expect(screen.queryByRole('link', { name: 'open' })).toBeNull();
});

it('does not send an invalid sender address to people search', () => {
  setup('not-an-email');
  fireEvent.focus(screen.getByRole('button', { name: 'show' }));
  expect(mocks.search).not.toHaveBeenCalled();
  expect(screen.getByText('unavailable')).toBeTruthy();
});
