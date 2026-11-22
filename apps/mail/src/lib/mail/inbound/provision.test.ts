import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveInboundMailbox } from './ingest';

vi.mock('../repository/shared', () => ({
  linkPersonalMailboxWorkspace: vi.fn(async () => undefined),
}));

type Row = Record<string, unknown>;

function createAdmin({
  authEmail = 'person@example.com',
  confirmed = true,
  insertError = null,
  mailboxes = [],
  raceWinner = null,
  profiles = [{ email: 'person@example.com', user_id: 'user' }],
}: {
  authEmail?: string | null;
  confirmed?: boolean;
  insertError?: Row | null;
  mailboxes?: Row[];
  raceWinner?: Row | null;
  profiles?: Row[];
}) {
  const inserts: Row[] = [];
  const memberships: Row[] = [];
  const domains: Row[] = [
    {
      catch_all_enabled: true,
      catch_all_mailbox_id: 'fallback',
      id: 'ingress',
    },
  ];
  const rows: Record<string, Row[]> = {
    mail_domains: domains,
    mail_mailboxes: [
      ...mailboxes,
      { domain_id: 'canonical', id: 'fallback', status: 'active' },
    ],
    user_private_details: profiles,
    users: [{ display_name: 'Person', id: 'user' }],
  };
  const table = (name: string) => {
    const filters: Array<[string, unknown]> = [];
    const matches = () =>
      (rows[name] ?? []).filter((row) =>
        filters.every(([column, value]) => row[column] === value)
      );
    const builder: Record<string, unknown> = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      insert(value: Row) {
        inserts.push(value);
        if (raceWinner) rows.mail_mailboxes?.unshift(raceWinner);
        const error = raceWinner
          ? {
              code: '23505',
              details: `Key (address)=(${String(value.address)}) already exists.`,
            }
          : insertError;
        return {
          select: () => ({
            single: async () =>
              error
                ? { data: null, error }
                : { data: { id: 'new', ...value }, error: null },
          }),
        };
      },
      limit: async (count: number) => ({
        data: matches().slice(0, count),
        error: null,
      }),
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      select: () => builder,
      upsert: async (value: Row) => {
        memberships.push(value);
        return { error: null };
      },
    };
    return builder;
  };
  const admin = {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              email: authEmail,
              email_confirmed_at: confirmed ? '2026-06-01T00:00:00.000Z' : null,
              id,
            },
          },
          error: null,
        }),
      },
    },
    from: table,
    schema: () => ({ from: table }),
  };
  return { admin, inserts, memberships };
}

const resolve = (admin: unknown) =>
  resolveInboundMailbox({
    admin: admin as Record<string, never>,
    canonicalDomainId: 'canonical',
    canonicalRecipient: 'Person@Example.com',
    ingressDomainId: 'ingress',
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inbound mailbox provisioning', () => {
  it('creates the exact mailbox for a confirmed internal user before catch-all', async () => {
    const { admin, inserts, memberships } = createAdmin({});
    const result = await resolve(admin);
    expect(result).toMatchObject({ mailbox: { id: 'new' }, route: 'exact' });
    expect(inserts).toEqual([
      expect.objectContaining({
        address: 'person@example.com',
        created_by: 'user',
        domain_id: 'canonical',
        type: 'personal',
      }),
    ]);
    expect(memberships).toEqual([
      expect.objectContaining({
        mailbox_id: 'new',
        role: 'owner',
        user_id: 'user',
      }),
    ]);
  });

  it.each([
    ['an unconfirmed account email', { confirmed: false }],
    ['a different confirmed account email', { authEmail: 'other@example.com' }],
    ['no matching profile', { profiles: [] }],
    [
      'an ambiguous profile email',
      {
        profiles: [
          { email: 'person@example.com', user_id: 'user' },
          { email: 'person@example.com', user_id: 'other' },
        ],
      },
    ],
  ])('falls back to catch-all for %s', async (_label, options) => {
    const { admin, inserts } = createAdmin(options);
    const result = await resolve(admin);
    expect(result).toMatchObject({
      mailbox: { id: 'fallback' },
      route: 'catch_all',
    });
    expect(inserts).toEqual([]);
  });

  it('uses the mailbox a concurrent first delivery created', async () => {
    const { admin, memberships } = createAdmin({
      raceWinner: {
        address: 'person@example.com',
        domain_id: 'canonical',
        id: 'winner',
        status: 'active',
      },
    });
    const result = await resolve(admin);
    expect(result).toMatchObject({ mailbox: { id: 'winner' }, route: 'exact' });
    expect(memberships).toEqual([]);
  });

  it('fails a unique violation that left no mailbox instead of using catch-all', async () => {
    const { admin } = createAdmin({
      insertError: { code: '23505', details: 'reserved person@example.com' },
    });
    const failure = await resolve(admin).catch((error: Error) => error);
    expect((failure as Error).message).toBe(
      'Mailbox provisioning failed at insert (23505)'
    );
  });

  it('throws provisioning failures without the recipient address', async () => {
    const { admin } = createAdmin({
      insertError: {
        code: '23503',
        details: 'Key (address)=(person@example.com) is not present.',
        message: 'insert or update violates foreign key person@example.com',
      },
    });
    const failure = await resolve(admin).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      'Mailbox provisioning failed at insert (23503)'
    );
    expect(JSON.stringify(failure)).not.toContain('example.com');
  });

  it('keeps a retained mailbox inactive and logs only its id and status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { admin, inserts } = createAdmin({
      mailboxes: [
        {
          address: 'person@example.com',
          domain_id: 'canonical',
          id: 'retained',
          status: 'disabled',
        },
      ],
    });
    const result = await resolve(admin);
    expect(result).toMatchObject({
      mailbox: { id: 'fallback' },
      route: 'catch_all',
    });
    expect(inserts).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      '[mail] inbound recipient mailbox is not active',
      {
        mailboxId: 'retained',
        status: 'disabled',
      }
    );
  });
});
