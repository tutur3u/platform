import { expect, it, vi } from 'vitest';
const context = vi.hoisted(() => vi.fn());
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: context }));
import {
  meetAiAvailable,
  isMeetAiAvailableForWorkspace,
} from './workspace-gate';
it('keeps workspace-wide AI off with absent attestation storage regardless of environment', async () => {
  for (const env of [
    undefined,
    {},
    { MEET_AI_DISABLED: 'false', MEET_AI_ENABLED_WORKSPACE_IDS: '*' },
  ]) {
    expect(isMeetAiAvailableForWorkspace('synthetic', env)).toBe(false);
    context.mockResolvedValue({ env });
    expect(await meetAiAvailable('synthetic')).toBe(false);
  }
});
