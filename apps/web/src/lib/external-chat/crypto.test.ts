import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createIngestSecret,
  hashExternalChatSecret,
  secretLastFour,
  signControlRequest,
  verifyExternalChatSecret,
} from './crypto';

describe('external chat credentials', () => {
  it('issues high-entropy secrets and stores only deterministic hashes', () => {
    const secret = createIngestSecret();
    expect(secret).toMatch(/^ecs_[A-Za-z0-9_-]{40,}$/);
    expect(hashExternalChatSecret(secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashExternalChatSecret(secret)).not.toContain(secret);
    expect(secretLastFour(secret)).toBe(secret.slice(-4));
  });

  it('compares hashes without accepting a different secret', () => {
    const secret = createIngestSecret();
    const hash = hashExternalChatSecret(secret);
    expect(verifyExternalChatSecret(secret, hash)).toBe(true);
    expect(verifyExternalChatSecret(`${secret}x`, hash)).toBe(false);
  });

  it('signs the timestamp and exact request body', () => {
    const input = {
      body: '{"content":"hello"}',
      secret: 'control-secret',
      timestamp: '2026-08-01T00:00:00.000Z',
    };
    expect(signControlRequest(input)).toBe(signControlRequest(input));
    expect(signControlRequest({ ...input, body: '{}' })).not.toBe(
      signControlRequest(input)
    );
  });
});
