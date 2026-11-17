// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { createElement } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { MessageDetailsPanel } from './message-details-panel';

vi.mock('@tuturuuu/utils/timezone', () => ({
  getBrowserTimezone: () => 'Asia/Ho_Chi_Minh',
}));

vi.mock('@tuturuuu/internal-api/people', () => ({
  resolveWorkspacePeople: vi.fn(async (_ws: string, emails: string[]) => ({
    data: emails.map((email) => ({
      email,
      kind: 'unknown',
      displayName: null,
      avatarUrl: null,
    })),
  })),
  createSenderContact: vi.fn(),
  getContactCreateCapability: vi.fn(),
  getSenderContactOperation: vi.fn(),
}));
vi.mock('@/components/mail-actor-provider', () => ({
  useMailActor: () => null,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTimeZone: () => 'Asia/Ho_Chi_Minh',
  useTranslations: () => (key: string) => key,
}));

beforeAll(() => {
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
});
afterEach(cleanup);

function message(overrides: Partial<MailMessageDetail> = {}) {
  return {
    fromAddress: 'sender@example.com',
    fromName: 'Synthetic Sender',
    recipients: [],
    safeHeaders: {},
    receivedAt: '2026-11-17T03:52:07.000Z',
    sentAt: null,
    envelopeFrom: null,
    envelopeTo: null,
    observedRecipient: null,
    internetMessageId: null,
    inReplyTo: null,
    ...overrides,
  } as unknown as MailMessageDetail;
}

function renderPanel(detail: MailMessageDetail, onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MessageDetailsPanel, {
        id: 'details',
        message: detail,
        workspaceId: 'workspace-1',
        onClose,
      })
    )
  );
  return onClose;
}

function rowValue(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling;
}

it('shows Sent and a distinct Received in the viewer zone', () => {
  renderPanel(
    message({
      sentAt: '2026-11-17T03:52:07.000Z',
      receivedAt: '2026-11-17T04:10:00.000Z',
    })
  );
  expect(rowValue('sent')?.textContent).toContain('10:52');
  expect(rowValue('sent')?.textContent).toContain('GMT+7');
  expect(rowValue('received')?.textContent).toContain('11:10');
  expect(
    rowValue('sent')?.querySelector('time')?.getAttribute('dateTime')
  ).toBe('2026-11-17T03:52:07.000Z');
});

it('omits Received when it matches Sent', () => {
  renderPanel(message({ sentAt: '2026-11-17T03:52:07.000Z' }));
  expect(screen.getByText('sent', { selector: 'dt' })).toBeTruthy();
  expect(screen.queryByText('received', { selector: 'dt' })).toBeNull();
});

it('keeps the raw Date and unlabelled headers in a collapsed disclosure', () => {
  renderPanel(
    message({
      safeHeaders: {
        date: 'Tue, 17 Nov 2026 03:52:07 +0000',
        'x-custom': 'synthetic-value',
      },
    })
  );
  const toggle = screen.getByRole('button', { name: 'technical_headers' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Tue, 17 Nov 2026 03:52:07 +0000')).toBeNull();
  expect(screen.queryByText('synthetic-value')).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const region = document.getElementById(
    toggle.getAttribute('aria-controls') ?? ''
  );
  expect(region?.textContent).toContain('Tue, 17 Nov 2026 03:52:07 +0000');
  expect(region?.textContent).toContain('x-custom');
  expect(region?.textContent).toContain('synthetic-value');
});

it('has no technical disclosure when every header is readable', () => {
  renderPanel(message());
  expect(
    screen.queryByRole('button', { name: 'technical_headers' })
  ).toBeNull();
});

it('collapses on Escape pressed inside the region', () => {
  const onClose = renderPanel(message());
  fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
