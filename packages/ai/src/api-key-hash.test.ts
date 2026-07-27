import { describe, expect, it } from 'vitest';
import {
  extractAiApiKeyPrefix,
  generateAiApiKey,
  validateApiKeyHash,
} from './api-key-hash';

describe('AI Studio API keys', () => {
  it('generates a hash-only ttr_ai_ credential contract', async () => {
    const key = await generateAiApiKey();

    expect(key.secret).toMatch(/^ttr_ai_[a-f0-9]{16}_[A-Za-z0-9_-]{40,}$/);
    expect(key.prefix).toMatch(/^ttr_ai_[a-f0-9]{16}$/);
    expect(extractAiApiKeyPrefix(key.secret)).toBe(key.prefix);
    expect(key.hash).not.toContain(key.secret);
    expect(await validateApiKeyHash(key.secret, key.hash)).toBe(true);
  });

  it('rejects malformed, modified, and unrelated credentials', async () => {
    const key = await generateAiApiKey();

    expect(extractAiApiKeyPrefix('sk-live-secret')).toBeNull();
    expect(extractAiApiKeyPrefix('ttr_ai_short_secret')).toBeNull();
    expect(await validateApiKeyHash(`${key.secret}x`, key.hash)).toBe(false);
  });
});
