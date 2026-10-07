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

import { ConnectedMailReader } from './connected-mail-reader';

it('keeps HTML email in an isolated frame that cannot run scripts or load remote resources', () => {
  const message = {
    id: 'message',
    from: 'sender@example.test',
    subject: 'Subject',
    date: '',
    unread: false,
    starred: false,
    html: '<p>Safe content</p>',
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
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  expect(frame.getAttribute('srcdoc')).toContain('img-src data:');
});
