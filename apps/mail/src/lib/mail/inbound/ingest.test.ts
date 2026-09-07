import { describe, expect, it, vi } from 'vitest';
import { createInboundMessage, resolveInboundMailbox } from './ingest';
import type { ParsedEmail } from './types';

describe('createInboundMessage', () => {
  it('deduplicates a second transport delivery by authoritative Message-ID', async () => {
    const existingMessage = {
      id: 'existing-message',
      internet_message_id: '<same-message@example.com>',
      provider: 'ses',
      provider_message_id: 'ses-delivery',
      thread_id: 'existing-thread',
    };
    const queries: Array<Array<[string, unknown]>> = [];
    const insert = vi.fn();
    const admin = {
      schema: vi.fn(() => ({
        from: vi.fn(() => {
          const filters: Array<[string, unknown]> = [];
          queries.push(filters);
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            insert,
            async maybeSingle() {
              const searchesInternetMessage = filters.some(
                ([column]) => column === 'internet_message_id'
              );
              return {
                data: searchesInternetMessage ? existingMessage : null,
                error: null,
              };
            },
            select() {
              return builder;
            },
          };
          return builder;
        }),
      })),
    };
    const parsed: ParsedEmail = {
      attachments: [],
      bodyHtml: null,
      bodyText: 'same message',
      cc: [],
      from: { address: 'sender@example.com', displayName: null },
      headers: {},
      inReplyTo: null,
      internetMessageId: '<same-message@example.com>',
      references: [],
      subject: 'Same message',
      to: [{ address: 'phucvo@tuturuuu.com', displayName: null }],
    };

    const result = await createInboundMessage({
      admin,
      mailbox: { id: 'mailbox' },
      parsed,
      provider: 'cloudflare',
      providerMessageId: 'cloudflare-delivery',
      rawMessageId: 'cloudflare-raw',
    });

    expect(result).toBe(existingMessage);
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContainEqual([
      'internet_message_id',
      '<same-message@example.com>',
    ]);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('resolveInboundMailbox', () => {
  function adminWithRows(rows: Record<string, Record<string, unknown>[]>) {
    return {
      schema: () => ({
        from: (table: string) => {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            async maybeSingle() {
              const row = (rows[table] ?? []).find((candidate) =>
                filters.every(([column, value]) => candidate[column] === value)
              );
              return { data: row ?? null, error: null };
            },
            select() {
              return builder;
            },
          };
          return builder;
        },
      }),
    };
  }

  it('gives an active exact mailbox precedence over catch-all', async () => {
    const result = await resolveInboundMailbox({
      admin: adminWithRows({
        mail_domains: [
          {
            catch_all_enabled: true,
            catch_all_mailbox_id: 'fallback',
            id: 'ingress',
          },
        ],
        mail_mailboxes: [
          {
            address: 'known@example.com',
            domain_id: 'canonical',
            id: 'exact',
            status: 'active',
          },
          { domain_id: 'canonical', id: 'fallback', status: 'active' },
        ],
      }),
      canonicalDomainId: 'canonical',
      canonicalRecipient: 'known@example.com',
      ingressDomainId: 'ingress',
      provisionInternalUser: false,
    });

    expect(result).toMatchObject({ mailbox: { id: 'exact' }, route: 'exact' });
  });

  it('uses only an enabled active canonical catch-all target', async () => {
    const result = await resolveInboundMailbox({
      admin: adminWithRows({
        mail_domains: [
          {
            catch_all_enabled: true,
            catch_all_mailbox_id: 'fallback',
            id: 'ingress',
          },
        ],
        mail_mailboxes: [
          { domain_id: 'canonical', id: 'fallback', status: 'active' },
        ],
      }),
      canonicalDomainId: 'canonical',
      canonicalRecipient: 'unknown@example.com',
      ingressDomainId: 'ingress',
      provisionInternalUser: false,
    });

    expect(result).toMatchObject({
      mailbox: { id: 'fallback' },
      route: 'catch_all',
    });
  });

  it.each(['disabled', 'quarantined', 'archived'])(
    'routes a %s address to catch-all without recreating its mailbox',
    async (status) => {
      const result = await resolveInboundMailbox({
        admin: adminWithRows({
          mail_domains: [
            {
              id: 'ingress',
              catch_all_enabled: true,
              catch_all_mailbox_id: 'fallback',
            },
          ],
          mail_mailboxes: [
            {
              id: 'reserved',
              address: 'former@example.com',
              domain_id: 'canonical',
              status,
            },
            { id: 'fallback', domain_id: 'canonical', status: 'active' },
          ],
        }),
        canonicalDomainId: 'canonical',
        canonicalRecipient: 'former@example.com',
        ingressDomainId: 'ingress',
      });
      expect(result).toMatchObject({
        mailbox: { id: 'fallback' },
        route: 'catch_all',
      });
    }
  );
});

describe('verified self-delivery', () => {
  it('adds Inbox to an existing sent copy without duplicating the message', async () => {
    const sent = {
      id: 'sent',
      direction: 'outbound',
      internet_message_id: '<self@example.com>',
    };
    const assignments: unknown[] = [];
    const admin = {
      schema: () => ({
        from: (table: string) => {
          const filters: string[] = [];
          const query = {
            select: () => query,
            eq: (key: string) => {
              filters.push(key);
              return query;
            },
            upsert: (value: unknown) => {
              if (table === 'mail_message_labels') assignments.push(value);
              return query;
            },
            single: async () => ({ data: { id: 'inbox' }, error: null }),
            maybeSingle: async () => ({
              data: filters.includes('internet_message_id') ? sent : null,
              error: null,
            }),
          };
          return query;
        },
      }),
    };
    const message = await createInboundMessage({
      admin,
      mailbox: { id: 'personal' },
      provider: 'cloudflare',
      providerMessageId: 'incoming',
      rawMessageId: 'raw',
      parsed: {
        internetMessageId: '<self@example.com>',
        attachments: [],
        headers: {},
        references: [],
        inReplyTo: null,
        bodyHtml: null,
        bodyText: 'test',
        cc: [],
        to: [],
        from: null,
        subject: 'test',
      },
    });
    expect(message).toBe(sent);
    expect(assignments).toEqual([{ message_id: 'sent', label_id: 'inbox' }]);
  });
});
