// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { MailAttachment } from '@tuturuuu/internal-api';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ text: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({ getMailAttachmentText: api.text }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
// The dynamic preview boundary receives the URL that the DOCX helper validates.
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ url }: { url: string }) =>
      createElement('span', {
        'data-testid': 'document-preview',
        'data-url': url,
      }),
}));

import { MailAttachmentCard } from './mail-attachment-card';

const path =
  '/api/v1/workspaces/ws/mail/mailboxes/box/messages/message/attachments/file';
const attachment: MailAttachment = {
  id: 'file',
  contentId: null,
  contentType: 'text/plain',
  disposition: 'attachment',
  filename: 'fixture.txt',
  protectedUrl: path,
  sizeBytes: 12,
};
function show(value: MailAttachment) {
  render(
    createElement(
      QueryClientProvider,
      {
        client: new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
      },
      createElement(MailAttachmentCard, { attachment: value })
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'preview_attachment' }));
}

describe('attachment transport and rendered mount URLs', () => {
  beforeEach(() => {
    api.text.mockReset().mockResolvedValue('Fixture preview');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it.each(['', '/mail'])(
    'keeps text helper input raw at base %j',
    async (base) => {
      vi.stubGlobal('__tuturuuuAppBase', base);
      show(attachment);
      await waitFor(() =>
        expect(api.text).toHaveBeenCalledWith(path, expect.any(AbortSignal))
      );
      expect(await screen.findByText('Fixture preview')).toBeTruthy();
      for (const link of screen.getAllByRole('link'))
        expect(link.getAttribute('href')).toBe(`${base}${path}`);
    }
  );
  it('keeps the DOCX helper boundary raw while mounting its download', () => {
    vi.stubGlobal('__tuturuuuAppBase', '/mail');
    show({
      ...attachment,
      filename: 'fixture.docx',
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(
      screen.getByTestId('document-preview').getAttribute('data-url')
    ).toBe(path);
    for (const link of screen.getAllByRole('link'))
      expect(link.getAttribute('href')).toBe(`/mail${path}`);
  });
});
