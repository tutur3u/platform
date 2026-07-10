import { describe, expect, it, vi } from 'vitest';
import { createInboundMessage } from './ingest';
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
