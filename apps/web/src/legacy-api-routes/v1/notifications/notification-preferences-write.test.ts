import { describe, expect, it, vi } from 'vitest';
import { saveNotificationPreferences } from './notification-preferences-write';

function createAdminClientMock({
  insertResults = [],
  updateResults = [],
}: {
  insertResults?: Array<{ error: null | { code?: string; message: string } }>;
  updateResults?: Array<{
    data: null | { id: string };
    error: null | { message: string };
  }>;
}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const scopes: Array<{ method: 'eq' | 'is'; field: string; value: unknown }> =
    [];

  const from = vi.fn(() => {
    const query = {
      eq: vi.fn((field: string, value: unknown) => {
        scopes.push({ method: 'eq', field, value });
        return query;
      }),
      insert: vi.fn(async (payload: unknown) => {
        inserts.push(payload);
        return insertResults.shift() ?? { error: null };
      }),
      is: vi.fn((field: string, value: unknown) => {
        scopes.push({ method: 'is', field, value });
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        return updateResults.shift() ?? { data: null, error: null };
      }),
      select: vi.fn(() => query),
      update: vi.fn((payload: unknown) => {
        updates.push(payload);
        return query;
      }),
    };

    return query;
  });

  return {
    client: { from },
    inserts,
    scopes,
    updates,
  };
}

describe('saveNotificationPreferences', () => {
  it('updates existing account preferences without inserting duplicates', async () => {
    const admin = createAdminClientMock({
      updateResults: [{ data: { id: 'preference-1' }, error: null }],
    });

    await expect(
      saveNotificationPreferences({
        preferences: [
          {
            eventType: 'email_notifications',
            channel: 'email',
            enabled: false,
          },
        ],
        scope: 'user',
        supabaseAdmin: admin.client as never,
        userId: 'user-1',
        wsId: null,
      })
    ).resolves.toBeNull();

    expect(admin.updates).toEqual([{ enabled: false }]);
    expect(admin.inserts).toEqual([]);
    expect(admin.scopes).toContainEqual({
      method: 'is',
      field: 'ws_id',
      value: null,
    });
  });

  it('retries update when a concurrent account insert wins the unique race', async () => {
    const admin = createAdminClientMock({
      insertResults: [
        {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          },
        },
      ],
      updateResults: [
        { data: null, error: null },
        { data: { id: 'preference-1' }, error: null },
      ],
    });

    await expect(
      saveNotificationPreferences({
        preferences: [
          {
            eventType: 'push_notifications',
            channel: 'push',
            enabled: true,
          },
        ],
        scope: 'user',
        supabaseAdmin: admin.client as never,
        userId: 'user-1',
        wsId: null,
      })
    ).resolves.toBeNull();

    expect(admin.updates).toEqual([{ enabled: true }, { enabled: true }]);
    expect(admin.inserts).toEqual([
      {
        ws_id: null,
        user_id: 'user-1',
        event_type: 'push_notifications',
        channel: 'push',
        enabled: true,
        scope: 'user',
      },
    ]);
  });

  it('scopes workspace preferences to the workspace id', async () => {
    const admin = createAdminClientMock({
      updateResults: [{ data: null, error: null }],
    });

    await expect(
      saveNotificationPreferences({
        preferences: [
          {
            eventType: 'workspace_invite',
            channel: 'web',
            enabled: false,
          },
        ],
        scope: 'workspace',
        supabaseAdmin: admin.client as never,
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    ).resolves.toBeNull();

    expect(admin.scopes).toContainEqual({
      method: 'eq',
      field: 'ws_id',
      value: 'workspace-1',
    });
    expect(admin.inserts).toEqual([
      {
        ws_id: 'workspace-1',
        user_id: 'user-1',
        event_type: 'workspace_invite',
        channel: 'web',
        enabled: false,
        scope: 'workspace',
      },
    ]);
  });
});
