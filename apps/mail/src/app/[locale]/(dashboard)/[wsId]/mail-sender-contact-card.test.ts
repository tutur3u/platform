// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
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
  // useIsMobile reads matchMedia, which jsdom lacks; the 1024 px jsdom
  // viewport selects the desktop sheet.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
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

it('never opens on hover', async () => {
  resolveAs({ kind: 'unknown' });
  const trigger = setup();
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  fireEvent.mouseEnter(trigger);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('opens a sheet on click, closes on Escape and returns focus', async () => {
  resolveAs({ kind: 'unknown' });
  const trigger = setup();
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.getAttribute('data-slot')).toBe('sheet-content');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  await waitFor(() => expect(document.activeElement).toBe(dialog));
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('opens from the keyboard with ArrowDown', async () => {
  resolveAs({ kind: 'unknown' });
  const trigger = setup();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(await screen.findByRole('dialog')).toBeTruthy();
});

it('falls back to the header name when lookup fails and recovers on retry', async () => {
  mocks.resolve.mockRejectedValueOnce(new Error('HTTP 404'));
  const trigger = setup();
  fireEvent.click(trigger);
  const retry = await screen.findByRole('button', { name: 'retry' });
  expect(screen.getByText('unavailable')).toBeTruthy();
  expect(trigger.textContent).toContain('Header name');
  resolveAs({
    kind: 'member',
    id: 'member-3',
    displayName: 'Lan Pham',
    emailVisible: true,
  });
  fireEvent.click(retry);
  await waitFor(() => expect(trigger.textContent).toContain('Lan Pham'));
  expect(screen.queryByRole('button', { name: 'retry' })).toBeNull();
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('shows initials from the visible name, never a hidden email', async () => {
  resolveAs({
    kind: 'member',
    id: 'member-4',
    displayName: null,
    emailVisible: false,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    h(
      QueryClientProvider,
      { client },
      h(MailSenderContactCard, {
        workspaceId: 'workspace-1',
        address: 'zed.hidden@example.com',
        name: null,
      })
    )
  );
  const trigger = screen.getByRole('button', { name: 'show' });
  await waitFor(() => expect(trigger.textContent).toContain('member'));
  // Avatar fallback "M" from the visible label, then the label itself.
  expect(trigger.textContent).toBe('Mmember');
});

it('keeps unknown senders as the header name with their domain', async () => {
  resolveAs({ kind: 'unknown' });
  const trigger = setup();
  fireEvent.click(trigger);
  expect(await screen.findByText('example.com')).toBeTruthy();
  expect(trigger.textContent).toContain('Header name');
});
