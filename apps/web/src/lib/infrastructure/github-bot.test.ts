import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  enableGitHubBotWatcherAutoPickup,
  listGitHubBotState,
  sanitizeGitHubBotPublicText,
  sanitizeGitHubError,
} from './github-bot';

function createFakePrivateDb() {
  const tables: Record<string, unknown[]> = {
    github_bot_audit_events: [
      {
        actor_type: 'user',
        actor_user_id: 'user-secret-id',
        created_at: '2026-06-11T00:00:00.000Z',
        event_type: 'configuration.validation_failed',
        id: 'audit-1',
        metadata: {
          raw: 'token=abc Bearer secret-token ops@example.com /Users/vhpx/private secret.internal.local',
        },
      },
    ],
    github_bot_configurations: [
      {
        app_id: '123',
        created_at: '2026-06-11T00:00:00.000Z',
        data_key_ciphertext: 'encrypted-data-key-secret',
        enabled: true,
        id: 'tuturuuu-ci',
        installation_id: '456',
        last_validated_at: null,
        last_validation_error: null,
        permissions: { checks: 'write' },
        private_key_encrypted: 'encrypted-private-key-secret',
        private_key_fingerprint: 'fingerprint',
        repository_name: 'platform',
        repository_owner: 'tutur3u',
        updated_at: '2026-06-11T00:00:00.000Z',
      },
    ],
    github_bot_watcher_clients: [
      {
        created_at: '2026-06-11T00:00:00.000Z',
        expires_at: '2026-09-09T00:00:00.000Z',
        id: 'client-1',
        last_four: 'last',
        last_issued_at: null,
        last_used_at: null,
        name: 'Watcher',
        revoked_at: null,
        token_hash: 'hashed-watcher-token-secret',
        token_prefix: 'ttr_github_bot_prefix',
      },
    ],
  };

  return {
    schema: () => ({
      from: (table: string) => ({
        eq() {
          return this;
        },
        limit() {
          return { data: tables[table] ?? [], error: null };
        },
        maybeSingle() {
          return { data: tables[table]?.[0] ?? null, error: null };
        },
        order() {
          return this;
        },
        select() {
          return this;
        },
      }),
    }),
  };
}

function createMutableFakePrivateDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    github_bot_audit_events: [],
    github_bot_configurations: [
      {
        app_id: '123',
        created_at: '2026-06-11T00:00:00.000Z',
        data_key_ciphertext: 'encrypted-data-key-secret',
        enabled: true,
        id: 'tuturuuu-ci',
        installation_id: '456',
        last_validated_at: '2026-06-11T00:00:00.000Z',
        last_validation_error: null,
        permissions: { checks: 'write' },
        private_key_encrypted: 'encrypted-private-key-secret',
        private_key_fingerprint: 'fingerprint',
        repository_name: 'platform',
        repository_owner: 'tutur3u',
        updated_at: '2026-06-11T00:00:00.000Z',
      },
    ],
    github_bot_watcher_clients: [
      {
        configuration_id: 'tuturuuu-ci',
        created_at: '2026-06-10T00:00:00.000Z',
        expires_at: '2026-09-08T00:00:00.000Z',
        id: 'old-auto-client',
        last_four: 'old1',
        last_issued_at: null,
        last_used_at: null,
        name: 'Blue/green watcher auto-pickup',
        revoked_at: null,
        token_hash: 'hashed-old-auto-token',
        token_prefix: 'ttr_github_bot_old_auto',
      },
    ],
  };

  function createQuery(table: string) {
    let lastResult: {
      data: Record<string, unknown>[];
      error: null;
    } | null = null;
    let limitCount: number | null = null;
    let updateValues: Record<string, unknown> | null = null;
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];

    const selectRows = () => {
      const rows = tables[table] ?? [];
      const matched = rows.filter((row) =>
        filters.every((filter) => filter(row))
      );

      return {
        data: limitCount ? matched.slice(0, limitCount) : matched,
        error: null,
      };
    };

    const applyUpdate = () => {
      if (!updateValues) {
        return;
      }

      const result = selectRows();
      for (const row of result.data) {
        Object.assign(row, updateValues);
      }
      lastResult = result;
    };

    const query = {
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        return query;
      },
      insert(value: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = tables[table] ?? [];
        const inserted = (Array.isArray(value) ? value : [value]).map(
          (row, index) => ({
            created_at: '2026-06-11T00:00:00.000Z',
            id: `${table}-new-${index}`,
            ...row,
          })
        );
        rows.unshift(...inserted);
        tables[table] = rows;
        lastResult = { data: inserted, error: null };
        return query;
      },
      is(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        applyUpdate();
        return query;
      },
      limit(value: number) {
        limitCount = value;
        return selectRows();
      },
      maybeSingle() {
        const result = lastResult ?? selectRows();
        return { data: result.data[0] ?? null, error: result.error };
      },
      order() {
        return query;
      },
      select() {
        return query;
      },
      single() {
        const result = lastResult ?? selectRows();
        return { data: result.data[0] ?? null, error: result.error };
      },
      update(value: Record<string, unknown>) {
        updateValues = value;
        return query;
      },
    };

    return query;
  }

  return {
    schema: () => ({
      from: (table: string) => createQuery(table),
    }),
    tables,
  };
}

describe('GitHub bot infrastructure helpers', () => {
  it('redacts private vault fields, token hashes, and unsafe audit metadata', async () => {
    const state = await listGitHubBotState(createFakePrivateDb() as never);
    const serialized = JSON.stringify(state);

    expect(state.configuration?.privateKeyConfigured).toBe(true);
    expect(serialized).not.toContain('encrypted-private-key-secret');
    expect(serialized).not.toContain('encrypted-data-key-secret');
    expect(serialized).not.toContain('hashed-watcher-token-secret');
    expect(serialized).not.toContain('user-secret-id');
    expect(serialized).not.toContain('ops@example.com');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('/Users/vhpx');
    expect(serialized).not.toContain('secret.internal.local');
    expect(serialized).not.toContain('token=abc');
  });

  it('sanitizes public text and GitHub errors before storage or responses', () => {
    expect(
      sanitizeGitHubBotPublicText(
        'Bearer secret-token user@example.com /Users/vhpx/key https://secret.internal.local?token=abc'
      )
    ).toBe('Bearer [REDACTED] [REDACTED_EMAIL] [REDACTED_PATH] [REDACTED_URL]');

    expect(
      sanitizeGitHubError(new Error('GitHub status 401 Bearer secret-token'))
    ).toBe('GitHub request failed with status 401');
  });

  it('queues watcher auto-pickup without returning the watcher client token', async () => {
    const originalControlDir = process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-bot-auto-'));
    const fakeDb = createMutableFakePrivateDb();

    try {
      process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = tempDir;
      const result = await enableGitHubBotWatcherAutoPickup({
        db: fakeDb as never,
        tokenEndpointUrl:
          'https://app.example.com/api/v1/infrastructure/github-bot/installation-token',
        userId: 'user-id',
      });
      const request = JSON.parse(
        fs.readFileSync(
          path.join(tempDir, 'blue-green-github-bot-runtime.request.json'),
          'utf8'
        )
      );
      const serializedResult = JSON.stringify(result);

      expect(request.kind).toBe('tuturuuu-github-bot-runtime-credential');
      expect(request.clientToken).toMatch(/^ttr_github_bot_/u);
      expect(request.repository).toEqual({
        name: 'platform',
        owner: 'tutur3u',
      });
      expect(serializedResult).not.toContain(request.clientToken);
      expect(result.autoPickup.clientId).toBeTruthy();
      const watcherClients = fakeDb.tables.github_bot_watcher_clients;
      const auditEvents = fakeDb.tables.github_bot_audit_events;

      if (!watcherClients || !auditEvents) {
        throw new Error('Expected GitHub bot fake DB tables');
      }

      expect(
        watcherClients.find((client) => client.id === 'old-auto-client')
          ?.revoked_at
      ).toBeTruthy();
      expect(
        auditEvents.some((event) => event.event_type === 'auto_pickup.queued')
      ).toBe(true);
    } finally {
      if (originalControlDir) {
        process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR = originalControlDir;
      } else {
        delete process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR;
      }
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
