// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/internal-api', () => ({
  connectedMailRequest: vi.fn(),
  connectedMailPath: () => '/authorized-attachment',
}));

import { sanitizeMailHtml } from '@/lib/mail/html';

import { ConnectedMailReader } from './connected-mail-reader';

it('keeps HTML email in an isolated frame that cannot run scripts or load remote resources', () => {
  const message = {
    id: 'message',
    from: 'sender@example.test',
    subject: 'Subject',
    date: '',
    unread: false,
    starred: false,
    html: sanitizeMailHtml(
      '<p>Safe content</p><a href="https://example.test/verify">Verify</a><script>alert(1)</script>'
    ),
    to: ['me@example.test'],
  };
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ConnectedMailReader, {
        workspaceId: 'personal',
        accountId: 'account',
        message,
        folder: 'inbox',
        onCompose: vi.fn(),
        onAction: vi.fn(),
        actionsPending: false,
        onSent: vi.fn(),
      })
    )
  );
  const frame = screen.getByTitle('connected_body');
  expect(frame.getAttribute('sandbox')).toBe(
    'allow-popups allow-popups-to-escape-sandbox'
  );
  for (const permission of [
    'allow-scripts',
    'allow-forms',
    'allow-same-origin',
  ])
    expect(frame.getAttribute('sandbox')).not.toContain(permission);
  expect(frame.getAttribute('srcdoc')).toContain('target="_blank"');
  expect(frame.getAttribute('srcdoc')).toContain('rel="noopener noreferrer"');
  expect(frame.getAttribute('srcdoc')).not.toContain('<script>');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  expect(frame.getAttribute('srcdoc')).toContain('img-src data:');
});
