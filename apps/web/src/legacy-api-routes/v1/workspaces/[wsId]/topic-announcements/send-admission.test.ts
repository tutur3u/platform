import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  enabled: true,
  archived: false,
  failReceipt: false,
  contactWsId: '',
  nullRecipient: false,
  recipientError: false,
  provider: vi.fn(),
  admin: vi.fn(),
  row: {} as Record<string, any>,
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/email-service', () => ({
  EmailService: { fromWorkspace: vi.fn() },
  sendWorkspaceEmail: f.provider,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  getSecrets: async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: f.enabled ? 'true' : 'false' },
  ],
  getSecret: (name: string, rows: Array<{ name: string }>) =>
    rows.find((row) => row.name === name),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_options: unknown, handler: () => unknown) => handler(),
}));

import { sendTopicAnnouncement } from './email';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const announcementId = '00000000-0000-4000-8000-000000000002';
const contactId = '00000000-0000-4000-8000-000000000003';

/** Stateful Supabase adapter: executes real query predicates and persists writes.
 * A failed sent receipt leaves processing unchanged, exactly as a DB error does.
 * Authentication/provider/storage are synthetic boundaries; no email is sent. */
function client() {
  const db: any = {
    schema: () => db,
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
  db.from = (table: string) => {
    let patch: Record<string, any> | undefined;
    const filters: Array<(row: any) => boolean> = [];
    const rows = () => {
      if (table === 'topic_announcements') return [f.row];
      if (table === 'topic_announcement_recipients')
        return [
          {
            announcement_id: announcementId,
            contact_id: contactId,
            contact: f.nullRecipient
              ? null
              : {
                  ws_id: f.contactWsId,
                  id: contactId,
                  archived: f.archived,
                  email: 'teacher@example.test',
                  name: 'Synthetic teacher',
                },
          },
        ];
      if (table === 'topic_announcement_contact_verifications')
        return [
          {
            contact_id: contactId,
            status: 'verified',
            expires_at: '2027-01-01T00:00:00Z',
          },
        ];
      if (table === 'topic_announcement_attachments') return [];
      if (table === 'workspaces')
        return [
          { id: workspaceId, name: 'Synthetic workspace', personal: false },
        ];
      if (table === 'workspace_secrets')
        return [
          {
            ws_id: workspaceId,
            name: 'ENABLE_TOPIC_ANNOUNCEMENTS',
            value: f.enabled ? 'true' : 'false',
          },
        ];
      throw new Error(`Unexpected fixture table ${table}`);
    };
    const execute = () => {
      if (table === 'topic_announcement_recipients' && f.recipientError)
        return {
          data: null,
          error: new Error('Synthetic recipient query rejection'),
        };
      const matched = rows().filter((row) =>
        filters.every((filter) => filter(row))
      );
      if (patch && matched.length) {
        if (patch.status === 'sent' && f.failReceipt)
          return {
            data: null,
            error: { message: 'Synthetic receipt write rejection' },
          };
        for (const row of matched)
          Object.assign(row, patch, { updated_at: new Date().toISOString() });
      }
      return { data: matched, error: null };
    };
    const query: any = {
      select: () => query,
      update: (value: Record<string, any>) => {
        patch = value;
        return query;
      },
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return query;
      },
      not: (key: string, _operator: string, value: unknown) => {
        filters.push((row) => row[key] !== value);
        return query;
      },
      lt: (key: string, value: string) => {
        filters.push((row) => row[key] < value);
        return query;
      },
      lte: (key: string, value: string) => {
        filters.push((row) => row[key] <= value);
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => {
        const result = execute();
        return { ...result, data: result.data?.[0] ?? null };
      },
    };
    Object.defineProperty(query, 'then', {
      value: (
        resolve: (value: unknown) => unknown,
        reject?: (cause: unknown) => unknown
      ) => Promise.resolve(execute()).then(resolve, reject),
    });
    return query;
  };
  return db;
}
const request = () =>
  new NextRequest(
    'https://web.example.test/api/cron/process-topic-announcement-queue',
    { headers: { authorization: 'Bearer synthetic-test-cron' } }
  );
const send = () =>
  sendTopicAnnouncement({
    actorUserId: 'synthetic-actor',
    announcementId,
    normalizedWsId: workspaceId,
    request: request(),
    resend: false,
    sbAdmin: client(),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
  vi.stubEnv('CRON_SECRET', 'synthetic-test-cron');
  f.enabled = true;
  f.contactWsId = workspaceId;
  f.nullRecipient = false;
  f.recipientError = false;
  f.archived = false;
  f.failReceipt = false;
  f.row = {
    id: announcementId,
    ws_id: workspaceId,
    created_by: 'synthetic-actor',
    updated_by: 'synthetic-actor',
    status: 'queued',
    scheduled_send_at: '2026-10-07T09:00:00Z',
    updated_at: '2026-10-07T09:00:00Z',
    title: 'Synthetic lesson',
    topic: 'Synthetic topic',
    body: '',
  };
  f.admin.mockResolvedValue(client());
  f.provider.mockResolvedValue({
    success: true,
    auditId: 'synthetic-audit',
    messageId: 'synthetic-provider-message',
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('real topic sender admission and authoritative receipt', () => {
  it('does not contact the provider when the topic feature is off', async () => {
    f.enabled = false;
    await send();
    expect(f.provider).not.toHaveBeenCalled();
  });
  it('does not send to an archived topic recipient', async () => {
    f.archived = true;
    await send();
    expect(f.provider).not.toHaveBeenCalled();
  });
  it.each(['moved-workspace', 'null-link'] as const)(
    'denies %s recipients as a whole intended batch',
    async (kind) => {
      if (kind === 'moved-workspace')
        f.contactWsId = 'another-synthetic-workspace';
      else f.nullRecipient = true;
      expect(await send()).toMatchObject({
        error: 'RECIPIENTS_UNAVAILABLE',
        status: 409,
      });
      expect(f.provider).not.toHaveBeenCalled();
      expect(f.row.status).toBe('queued');
    }
  );
  it('preserves recipient database failures without contacting the provider', async () => {
    f.recipientError = true;
    await expect(send()).rejects.toThrow('Synthetic recipient query rejection');
    expect(f.provider).not.toHaveBeenCalled();
    expect(f.row.status).toBe('queued');
  });
  it('preserves the ordinary verified-recipient successful receipt control', async () => {
    const result = await send();
    expect(result).toEqual({
      auditId: 'synthetic-audit',
      messageId: 'synthetic-provider-message',
    });
    expect(f.row).toMatchObject({
      status: 'sent',
      sent_email_audit_id: 'synthetic-audit',
    });
    expect(f.provider).toHaveBeenCalledOnce();
  });
  it('preserves a genuine provider failure and does not claim sent', async () => {
    f.provider.mockResolvedValue({
      success: false,
      error: 'SYNTHETIC_PROVIDER_REJECTION',
    });
    expect(await send()).toMatchObject({
      error: 'SYNTHETIC_PROVIDER_REJECTION',
      status: 502,
    });
    expect(f.row.status).toBe('failed');
  });
});
