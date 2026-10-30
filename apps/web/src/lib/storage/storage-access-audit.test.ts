import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  schema: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  auditStorageAccess,
  getStorageAccessAuditor,
  resetStorageAccessAuditorForTests,
  withStorageAccessAudit,
} from './storage-access-audit';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  resetStorageAccessAuditorForTests();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.schema.mockReturnValue({ from: mocks.from });
  mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
});

afterEach(() => vi.unstubAllEnvs());

describe('storage access audit (web binding)', () => {
  it('is off unless STORAGE_ACCESS_AUDIT_ENABLED=true', async () => {
    auditStorageAccess({
      action: 'sign',
      outcome: 'allowed',
      route: '/api/ai/chat/signed-read-url',
    });
    await getStorageAccessAuditor().settled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('writes bounded rows to private.storage_access_events with the service role', async () => {
    vi.stubEnv('STORAGE_ACCESS_AUDIT_ENABLED', 'true');
    auditStorageAccess({
      action: 'sign',
      actorId: USER,
      outcome: 'denied',
      path: `${WS}/chats/ai/resources/x/report.pdf`,
      route: '/api/ai/chat/signed-read-url',
      wsId: WS,
    });
    await getStorageAccessAuditor().settled();

    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.from).toHaveBeenCalledWith('storage_access_events');
    const [rows] = mocks.insert.mock.calls[0] as [Record<string, unknown>[]];
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'sign',
        actor_id: USER,
        outcome: 'denied',
        path_root: '(folder)',
        ws_id: WS,
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('report.pdf');
    // No STORAGE_ACCESS_AUDIT_HMAC_KEY: root only, never an unkeyed hash.
    expect(rows[0]?.object_hash).toBeNull();
  });

  it('keys object hashes with STORAGE_ACCESS_AUDIT_HMAC_KEY', async () => {
    vi.stubEnv('STORAGE_ACCESS_AUDIT_ENABLED', 'true');
    vi.stubEnv(
      'STORAGE_ACCESS_AUDIT_HMAC_KEY',
      'synthetic-audit-hmac-key-0123456789abcdef'
    );
    auditStorageAccess({
      action: 'sign',
      outcome: 'allowed',
      path: `${WS}/docs/report.pdf`,
      route: '/api/ai/chat/signed-read-url',
      wsId: WS,
    });
    await getStorageAccessAuditor().settled();

    const [rows] = mocks.insert.mock.calls[0] as [Record<string, unknown>[]];
    expect(rows[0]?.object_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('logs and swallows write failures', async () => {
    vi.stubEnv('STORAGE_ACCESS_AUDIT_ENABLED', 'true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.insert.mockResolvedValue({ error: new Error('relation missing') });

    expect(() =>
      auditStorageAccess({
        action: 'list',
        outcome: 'allowed',
        route: '/api/v1/workspaces/[wsId]/storage/list',
      })
    ).not.toThrow();
    await getStorageAccessAuditor().settled();

    expect(warn).toHaveBeenCalledWith('Storage access audit write failed', {
      message: 'relation missing',
    });
  });

  it('records one row per wrapped request from its final status', async () => {
    vi.stubEnv('STORAGE_ACCESS_AUDIT_ENABLED', 'true');
    const handler = withStorageAccessAudit(
      { action: 'delete', route: '/api/v1/workspaces/[wsId]/storage/object' },
      async (audit, status: number) => {
        audit.set({ actorId: USER, path: 'docs/a.pdf', wsId: WS });
        return { status };
      }
    );

    await expect(handler(403)).resolves.toEqual({ status: 403 });
    await getStorageAccessAuditor().settled();

    const [rows] = mocks.insert.mock.calls[0] as [Record<string, unknown>[]];
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'delete',
        outcome: 'denied',
        path_root: '(folder)',
      }),
    ]);
  });
});
