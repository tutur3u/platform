import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';
import { getAuthorizedMailRawSource } from './raw-source';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  message: vi.fn(),
  table: vi.fn(),
  filters: [] as [string, unknown][],
  messageRow: { raw_message_id: 'raw' } as { raw_message_id: string } | null,
  rawRow: { stored_object_id: 'object' } as Record<string, unknown> | null,
  objectRow: {
    provider: 'r2',
    bucket_name: 'bucket',
    object_key: 'raw.eml',
  } as Record<string, unknown> | null,
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./shared', () => ({
  mailMessageTable: mocks.message,
  privateTable: mocks.table,
}));

function query(row: () => unknown) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((key: string, value: unknown) => {
      mocks.filters.push([key, value]);
      return q;
    }),
    is: vi.fn((key: string, value: unknown) => {
      mocks.filters.push([key, value]);
      return q;
    }),
    maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
  };
  return q;
}
const input = {
  ctx: { user: { id: 'reader' } } as MailRouteContext,
  mailboxId: 'box',
  messageId: 'message',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.access.mockResolvedValue({ admin: {}, mailbox: {} });
  mocks.messageRow = { raw_message_id: 'raw' };
  mocks.rawRow = { stored_object_id: 'object' };
  mocks.objectRow = {
    provider: 'r2',
    bucket_name: 'bucket',
    object_key: 'raw.eml',
  };
  mocks.message.mockImplementation(() => query(() => mocks.messageRow));
  mocks.table.mockImplementation((_admin: unknown, table: string) =>
    query(() =>
      table === 'mail_raw_messages' ? mocks.rawRow : mocks.objectRow
    )
  );
});

it('rejects non-members before looking up any message or storage object', async () => {
  mocks.access.mockResolvedValue(null);
  expect(await getAuthorizedMailRawSource(input)).toBeNull();
  expect(mocks.access).toHaveBeenCalledWith(input.ctx, 'box');
  expect(mocks.message).not.toHaveBeenCalled();
  expect(mocks.table).not.toHaveBeenCalled();
});

it('requires the requested message in the authorized mailbox before accessing raw data', async () => {
  mocks.messageRow = null;
  expect(await getAuthorizedMailRawSource(input)).toBeNull();
  expect(mocks.filters).toEqual([
    ['id', 'message'],
    ['mailbox_id', 'box'],
  ]);
  expect(mocks.table).not.toHaveBeenCalled();
});

it('uses the group-aware message query and only its linked undeleted raw object', async () => {
  const access = { admin: {}, mailbox: { groupPolicy: {} } };
  mocks.access.mockResolvedValue(access);
  expect(await getAuthorizedMailRawSource(input)).toEqual({
    provider: 'r2',
    bucketName: 'bucket',
    objectKey: 'raw.eml',
  });
  expect(mocks.message).toHaveBeenCalledWith(access, input.ctx);
  expect(mocks.filters).toEqual([
    ['id', 'message'],
    ['mailbox_id', 'box'],
    ['id', 'raw'],
    ['id', 'object'],
    ['object_kind', 'raw_mime'],
    ['deleted_at', null],
  ]);
});

it('returns unavailable for missing raw objects instead of synthesizing a message', async () => {
  mocks.objectRow = null;
  expect(await getAuthorizedMailRawSource(input)).toBeNull();
});

it('supports the existing SES raw storage reference after authorization', async () => {
  mocks.rawRow = { s3_bucket: 'legacy', s3_key: 'message.eml' };
  expect(await getAuthorizedMailRawSource(input)).toEqual({
    provider: 's3',
    bucketName: 'legacy',
    objectKey: 'message.eml',
  });
});
