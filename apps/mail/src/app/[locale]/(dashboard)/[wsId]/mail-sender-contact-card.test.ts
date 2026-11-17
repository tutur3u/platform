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
import type { ResolvedWorkspacePerson } from '@tuturuuu/internal-api/people';
import { createElement as h, type ReactNode } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MailComposeProvider } from './mail-compose-context';
import { MailSenderContactCard } from './mail-sender-contact-card';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@tuturuuu/internal-api/people', () => ({
  resolveWorkspacePeople: mocks.resolve,
  createSenderContact: vi.fn(),
  getContactCreateCapability: vi.fn(),
  getSenderContactOperation: vi.fn(),
}));
vi.mock('@/components/mail-actor-provider', () => ({
  useMailActor: () => null,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.resolve.mockReset();
});

function resolveAs(person: Partial<ResolvedWorkspacePerson>) {
  mocks.resolve.mockImplementation(async (_ws: string, emails: string[]) => ({
    data: emails.map((email) => ({
      email,
      displayName: null,
      avatarUrl: null,
      ...person,
    })),
  }));
}

function setup(wrap?: (node: ReactNode) => ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const card = h(MailSenderContactCard, {
    workspaceId: 'workspace-1',
    address: 'SENDER@example.com',
    name: 'Header name',
  });
  render(h(QueryClientProvider, { client }, wrap ? wrap(card) : card));
  return screen.getByRole('button', { name: 'show' });
}

it('shows a visible member with copy and New message', async () => {
  resolveAs({
    kind: 'member',
    id: 'member-1',
    displayName: 'Tam Nguyen',
    emailVisible: true,
  });
  const openCompose = vi.fn();
  const trigger = setup((node) =>
    h(MailComposeProvider, { openCompose, children: node })
  );
  await waitFor(() => expect(trigger.textContent).toContain('Tam Nguyen'));
  expect(mocks.resolve).toHaveBeenCalledWith('workspace-1', [
    'sender@example.com',
  ]);
  fireEvent.click(trigger);
  expect(await screen.findByText('member')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'copy_email' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'new_message' }));
  expect(openCompose).toHaveBeenCalledWith({
    to: ['SENDER@example.com'],
    recipientDisplayNames: { 'SENDER@example.com': 'Tam Nguyen' },
  });
});

it('never renders an email the workspace hides', async () => {
  resolveAs({
    kind: 'member',
    id: 'member-2',
    displayName: 'Sam Ton',
    emailVisible: false,
  });
  const trigger = setup();
  await waitFor(() => expect(trigger.textContent).toContain('Sam Ton'));
  fireEvent.click(trigger);
  expect(await screen.findByText('email_hidden')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/sender@example\.com/iu);
  expect(screen.queryByRole('button', { name: 'copy_email' })).toBeNull();
});

it('links contacts to the Contacts app', async () => {
  resolveAs({
    kind: 'contact',
    id: 'contact-1',
    displayName: 'Team SePay',
    emailVisible: true,
    mailBlocked: false,
  });
  const trigger = setup();
  await waitFor(() => expect(trigger.textContent).toContain('Team SePay'));
  fireEvent.click(trigger);
  const link = await screen.findByRole('link', { name: 'open_in_contacts' });
  expect(link.getAttribute('href')).toMatch(
    /\/en\/workspace-1\/users\/database\/contact-1$/u
  );
});

it('opens after a 300 ms hover and closes on Escape', async () => {
  resolveAs({ kind: 'unknown' });
  vi.useFakeTimers();
  const trigger = setup();
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => vi.advanceTimersByTime(60));
  expect(screen.getByRole('dialog')).toBeTruthy();
  vi.useRealTimers();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('keeps unknown senders as the header name with their domain', async () => {
  resolveAs({ kind: 'unknown' });
  const trigger = setup();
  fireEvent.click(trigger);
  expect(await screen.findByText('example.com')).toBeTruthy();
  expect(trigger.textContent).toContain('Header name');
});
