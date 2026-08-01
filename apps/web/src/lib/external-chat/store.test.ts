import { describe, expect, it } from 'vitest';
import { serializeExternalChatBinding } from './store';

describe('external chat binding serialization', () => {
  it('never exposes hashes or encrypted control credentials', () => {
    const result = serializeExternalChatBinding({
      binding: {
        canonical_project_id: 'opaque-connector',
        is_enabled: true,
        settings: {
          chat: { bridgeBaseUrl: 'https://bridge.invalid', enabled: true },
        },
      },
      credentials: {
        configuration_revision: 2,
        control_secret_encrypted: 'encrypted-sensitive-value',
        control_secret_last_four: '5678',
        control_secret_rotated_at: '2026-08-01T00:00:00.000Z',
        ingest_secret_hash: 'a'.repeat(64),
        ingest_secret_last_four: '1234',
        ingest_secret_rotated_at: '2026-08-01T00:00:00.000Z',
        verified_at: '2026-08-01T00:05:00.000Z',
        verified_revision: 2,
        pending_action: null,
        pending_created_at: null,
        pending_secret_encrypted: null,
        pending_secret_hash: null,
        pending_secret_last_four: null,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('encrypted-sensitive-value');
    expect(serialized).not.toContain('a'.repeat(64));
    expect(result?.secrets.ingest.lastFour).toBe('1234');
    expect(result?.readiness.ready).toBe(true);
  });

  it('rejects readiness when verification belongs to an older configuration', () => {
    const result = serializeExternalChatBinding({
      binding: {
        canonical_project_id: 'opaque-connector',
        is_enabled: true,
        settings: { chat: { enabled: true } },
      },
      credentials: {
        configuration_revision: 3,
        control_secret_encrypted: 'encrypted-sensitive-value',
        control_secret_last_four: '5678',
        control_secret_rotated_at: '2026-08-01T00:00:00.000Z',
        ingest_secret_hash: 'a'.repeat(64),
        ingest_secret_last_four: '1234',
        ingest_secret_rotated_at: '2026-08-01T00:00:00.000Z',
        pending_action: null,
        pending_created_at: null,
        pending_secret_encrypted: null,
        pending_secret_hash: null,
        pending_secret_last_four: null,
        verified_at: '2026-08-01T00:05:00.000Z',
        verified_revision: 2,
      },
    });

    expect(result?.readiness).toEqual({
      errors: ['settings_invalid', 'bridge_verification_stale'],
      ready: false,
    });
  });
});
