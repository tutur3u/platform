import { expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';
import { copyAttachmentsToDraft } from './attachments';

const inserted = vi.hoisted(() => vi.fn());
const source = vi.hoisted(() => ({ contentId: '<logo@example.com>' }));
vi.mock('./bootstrap', () => ({
  requireMailboxAccess: async () => ({ admin: {} }),
}));
vi.mock('../storage', () => ({
  getMailR2BucketName: () => 'bucket',
  putMailStoredObject: vi.fn(),
  readMailStoredObject: async () => new Uint8Array([1, 2, 3]),
  deleteMailStoredObject: vi.fn(),
}));
vi.mock('./shared', () => ({
  mailMessageTable: () => {
    const query = {
      select: () => query,
      eq: () => query,
      update: () => query,
      maybeSingle: async () => ({ data: { id: 'message' } }),
    };
    return query;
  },
  privateTable: (_admin: unknown, table: string) => {
    let row: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: {
          content_id: source.contentId,
          content_type: 'image/png',
          disposition: 'inline',
          filename: 'logo.png',
          storage_bucket: 'source',
          storage_key: 'image',
        },
      }),
      limit: async () => ({ data: [] }),
      insert: (value: Record<string, unknown>) => {
        row = value;
        if (table === 'mail_attachments') inserted(value);
        return query;
      },
      single: async () => ({ data: { id: 'copied', ...row } }),
    };
    return query;
  },
}));
it('preserves an authorized source attachment CID and inline disposition in a copied draft', async () => {
  await copyAttachmentsToDraft({
    attachmentIds: ['image'],
    ctx: {} as MailRouteContext,
    draftId: 'draft',
    mailboxId: 'mailbox',
    sourceMessageId: 'source',
  });
  expect(inserted).toHaveBeenCalledWith(
    expect.objectContaining({
      content_id: 'logo@example.com',
      disposition: 'inline',
      message_id: 'draft',
    })
  );
});
it.each(['<logo image@example.com>', '<logo:1>', '<"logo">', '<logo;1>'])(
  'copies a file with unsupported inbound CID %s as a regular attachment',
  async (contentId) => {
    source.contentId = contentId;
    inserted.mockClear();
    const copied = await copyAttachmentsToDraft({
      attachmentIds: ['image'],
      ctx: {} as MailRouteContext,
      draftId: 'draft',
      mailboxId: 'mailbox',
      sourceMessageId: 'source',
    });
    expect(copied).toHaveLength(1);
    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        content_id: null,
        disposition: 'attachment',
        message_id: 'draft',
      })
    );
    source.contentId = '<logo@example.com>';
  }
);
