import { resetMeetAiUsageLimiterCache } from '@tuturuuu/ai/meetings/usage-limit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { limitMeetAiUsageOnWeb } from './meet-ai-usage-limit';

const input = {
  kind: 'recording' as const,
  userId: 'user-1',
  meetingId: 'meeting-1',
  workspaceId: 'ws-1',
  audioSeconds: 60,
};
const STRONG = 'x'.repeat(40);

describe(limitMeetAiUsageOnWeb, () => {
  beforeEach(() => {
    resetMeetAiUsageLimiterCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const key of [
      'ABUSE_GUARD_BACKEND',
      'ABUSE_GUARD_URL',
      'ABUSE_GUARD_SECRET',
      'ABUSE_GUARD_KEY_PEPPER',
      'ABUSE_GUARD_FAMILIES',
    ])
      vi.stubEnv(key, '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fails closed when the meet family is not assigned (no Upstash fallback)', async () => {
    await expect(limitMeetAiUsageOnWeb(input)).resolves.toMatchObject({
      ok: false,
      status: 503,
      reason: 'legacy',
    });
  });

  it('fails closed when the assigned family has no store configuration', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'meet');
    await expect(limitMeetAiUsageOnWeb(input)).resolves.toMatchObject({
      ok: false,
      status: 503,
      reason: 'off',
    });
  });

  it('fails closed when the configured store is unreachable', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'meet');
    vi.stubEnv('ABUSE_GUARD_URL', 'https://guard.invalid');
    vi.stubEnv('ABUSE_GUARD_SECRET', STRONG);
    vi.stubEnv('ABUSE_GUARD_KEY_PEPPER', `${STRONG}p`);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network down'))
    );
    await expect(limitMeetAiUsageOnWeb(input)).resolves.toMatchObject({
      ok: false,
      status: 503,
      reason: 'network',
    });
    vi.unstubAllGlobals();
  });
});
