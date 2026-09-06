import { describe, expect, it, vi } from 'vitest';
import type { ParsedEmail } from '../inbound/types';
import { deliverGroupMessage } from './delivery';
import { DEFAULT_GROUP_POLICY } from './policy';

type Row = Record<string, unknown>;
function adminWithRows(rows: Record<string, Row[]>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const predicates: Array<(row: Row) => boolean> = [];
        const result = () => ({
          data: (rows[table] ?? []).filter((row) =>
            predicates.every((p) => p(row))
          ),
          error: null,
        });
        const query = {
          select: () => query,
          order: () => query,
          range: () => query,
          eq: (key: string, value: unknown) => {
            predicates.push((row) => row[key] === value);
            return query;
          },
          in: (key: string, values: unknown[]) => {
            predicates.push((row) => values.includes(row[key]));
            return query;
          },
          maybeSingle: async () => ({
            data: result().data[0] ?? null,
            error: null,
          }),
          // biome-ignore lint/suspicious/noThenProperty: Model the awaited Supabase query builder.
          then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
            Promise.resolve(result()).then(resolve),
        };
        return query;
      },
    }),
  };
}
const parsed: ParsedEmail = {
  attachments: [],
  bodyHtml: null,
  bodyText: 'Private copy',
  cc: [],
  from: { address: 'owner@example.com', displayName: null },
  headers: {},
  inReplyTo: null,
  internetMessageId: '<test@example.com>',
  references: [],
  subject: 'Group message',
  to: [{ address: 'group@example.com', displayName: null }],
};
const personal = (id: string, status = 'active') => ({
  id,
  created_by: id,
  address: `${id}@example.com`,
  type: 'personal',
  status,
  domain_id: 'domain',
});
function setup(policy = DEFAULT_GROUP_POLICY, senderStatus = 'active') {
  return {
    admin: adminWithRows({
      mail_mailboxes: [
        personal('owner', senderStatus),
        personal('member'),
        personal('suspended', 'disabled'),
        { ...personal('foreign'), domain_id: 'other' },
      ],
      mail_mailbox_members: ['owner', 'member', 'suspended', 'foreign'].map(
        (user_id) => ({
          mailbox_id: 'group',
          user_id,
          role: user_id === 'owner' ? 'owner' : 'viewer',
        })
      ),
    }),
    mailbox: {
      id: 'group',
      domain_id: 'domain',
      metadata: { mail_group: policy },
    },
    parsed,
    provider: 'cloudflare' as const,
    providerMessageId: 'delivery',
    rawMessageId: 'raw',
  };
}

describe('history-off distribution delivery', () => {
  it('writes only active same-domain personal copies, never a shared archive', async () => {
    const write = vi.fn(
      async (_args: Parameters<typeof deliverGroupMessage>[0]) => ({})
    );
    expect(await deliverGroupMessage(setup(), write, async () => true)).toEqual(
      { imported: 2, status: 'imported' }
    );
    expect(write.mock.calls.map(([args]) => args.mailbox.id)).toEqual([
      'owner',
      'member',
    ]);
  });
  it('does not distribute unsigned or forged messages', async () => {
    const write = vi.fn();
    expect(
      await deliverGroupMessage(setup(), write, async () => false)
    ).toMatchObject({ imported: 0, status: 'quarantined' });
    expect(write).not.toHaveBeenCalled();
  });
  it('rejects suspended senders even under an anyone policy', async () => {
    const write = vi.fn();
    expect(
      await deliverGroupMessage(
        setup({ ...DEFAULT_GROUP_POLICY, posting: 'anyone' }, 'disabled'),
        write,
        async () => true
      )
    ).toMatchObject({ imported: 0, status: 'quarantined' });
    expect(write).not.toHaveBeenCalled();
  });
  it('permits organization posting without granting member-only attachments', async () => {
    const args = setup();
    args.admin = adminWithRows({
      mail_mailboxes: [personal('owner')],
      mail_mailbox_members: [
        { mailbox_id: 'group', user_id: 'member', role: 'viewer' },
      ],
    });
    args.parsed = {
      ...parsed,
      attachments: [
        {
          filename: 'test.txt',
          sizeBytes: 4,
          contentType: 'text/plain',
          contentId: null,
          disposition: 'attachment',
        },
      ],
    };
    const write = vi.fn();
    expect(
      await deliverGroupMessage(args, write, async () => true)
    ).toMatchObject({ status: 'quarantined' });
    expect(write).not.toHaveBeenCalled();
  });
  it('accepts authenticated internal group identities for organization posting', async () => {
    const args = setup();
    args.admin = adminWithRows({
      mail_mailboxes: [
        { ...personal('owner'), type: 'shared' },
        personal('member'),
      ],
      mail_mailbox_members: [
        { mailbox_id: 'group', user_id: 'member', role: 'viewer' },
      ],
    });
    const write = vi.fn(
      async (_args: Parameters<typeof deliverGroupMessage>[0]) => ({})
    );
    expect(
      await deliverGroupMessage(args, write, async () => true)
    ).toMatchObject({ imported: 1, status: 'imported' });
    expect(write.mock.calls[0]?.[0].mailbox.id).toBe('member');
  });
  it('leaves ordinary mailbox delivery unchanged', async () => {
    const args = setup();
    args.mailbox.metadata = {} as typeof args.mailbox.metadata;
    const authenticate = vi.fn();
    expect(await deliverGroupMessage(args, vi.fn(), authenticate)).toBeNull();
    expect(authenticate).not.toHaveBeenCalled();
  });
});
