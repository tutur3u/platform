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
});
