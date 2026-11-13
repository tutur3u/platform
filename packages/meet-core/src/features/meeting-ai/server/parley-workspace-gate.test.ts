import { expect, it, vi } from 'vitest';
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/meet-core/runtime', () => ({ MEETING_APP: 'parley' }));
import { isMeetAiAvailableForWorkspace } from './workspace-gate';
it('does not allow workspace-wide Parley generation through an app or allowlist bypass', () => {
  for (const env of [
    undefined,
    {},
    { MEET_AI_DISABLED: 'false', MEET_AI_ENABLED_WORKSPACE_IDS: '*' },
  ])
    expect(isMeetAiAvailableForWorkspace('synthetic', env)).toBe(false);
});
