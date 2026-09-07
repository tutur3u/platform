import { describe, expect, it } from 'vitest';
import { resolveForwardingMailbox } from './forwarding';
import { readMailAutomation } from './policy';

function database(rows: Record<string, Record<string, unknown>[]>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const filters: [string, unknown][] = [];
        const result = () => ({
          data:
            rows[table]?.find((row) =>
              filters.every(([key, value]) => row[key] === value)
            ) ?? null,
          error: null,
        });
        const query = {
          select: () => query,
          eq: (key: string, value: unknown) => {
            filters.push([key, value]);
            return query;
          },
          single: async () => result(),
          maybeSingle: async () => result(),
        };
        return query;
      },
    }),
  };
}
const target = {
  id: 'phuc',
  address: 'phuc@example.com',
  domain_id: 'domain',
  status: 'active',
  metadata: {},
};
const source = (forwarding: unknown) => ({
  id: 'security',
  domain_id: 'domain',
  metadata: { mail_automation: { forwarding, smartLabelsEnabled: false } },
});

describe('internal forwarding', () => {
  it('defaults malformed metadata to disabled', () => {
    expect(
      readMailAutomation({
        mail_automation: { forwarding: { mode: 'mailbox', address: 'bad' } },
      }).forwarding.mode
    ).toBe('off');
  });
  it('resolves an explicit active same-domain recipient', async () => {
    expect(
      await resolveForwardingMailbox(
        database({ mail_mailboxes: [target] }),
        source({ mode: 'mailbox', address: target.address })
      )
    ).toEqual(target);
  });
  it.each([
    { status: 'disabled' },
    { domain_id: 'other' },
    { id: 'security' },
    {
      metadata: {
        mail_group: {
          historyEnabled: false,
          posting: 'members',
          attachments: 'members',
          sendAs: 'managers',
        },
      },
    },
  ])(
    'rejects inactive, foreign, self, and group recipients %j',
    async (patch) => {
      expect(
        await resolveForwardingMailbox(
          database({ mail_mailboxes: [{ ...target, ...patch }] }),
          source({ mode: 'mailbox', address: target.address })
        )
      ).toBeNull();
    }
  );
  it('resolves the current catch-all on each delivery', async () => {
    const domain = {
      id: 'domain',
      catch_all_enabled: true,
      catch_all_mailbox_id: 'phuc',
    };
    const rows = {
      mail_domains: [domain],
      mail_mailboxes: [
        target,
        { ...target, id: 'new', address: 'new@example.com' },
      ],
    };
    const db = database(rows);
    expect(
      (await resolveForwardingMailbox(db, source({ mode: 'catch_all' })))?.id
    ).toBe('phuc');
    domain.catch_all_mailbox_id = 'new';
    expect(
      (await resolveForwardingMailbox(db, source({ mode: 'catch_all' })))?.id
    ).toBe('new');
    domain.catch_all_enabled = false;
    expect(
      await resolveForwardingMailbox(db, source({ mode: 'catch_all' }))
    ).toBeNull();
  });
});
