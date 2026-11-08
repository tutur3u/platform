import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));

import { isMeetAiEnabledForWorkspace, meetAiAvailable } from './workspace-gate';

const team = '00000000-0000-4000-8000-0000000000aa';
const other = '00000000-0000-4000-8000-0000000000bb';
describe('Meet Worker AI controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });
  it.each([
    undefined,
    {},
    { MEET_AI_DISABLED: '0' },
    { MEET_AI_DISABLED: 'false' },
    { MEET_AI_ENABLED_WORKSPACE_IDS: undefined },
  ])('allows by default or explicit off: %j', async (env) => {
    mocks.context.mockResolvedValue({ env });
    expect(await meetAiAvailable(team)).toBe(true);
  });
  it.each(['1', 'true', ' TRUE ', '', 'garbage'])(
    'denies switch %j',
    async (MEET_AI_DISABLED) => {
      mocks.context.mockResolvedValue({ env: { MEET_AI_DISABLED } });
      expect(await meetAiAvailable(team)).toBe(false);
    }
  );
  it.each(['', ' ', '\n', ' , '])(
    'treats a present but blank legacy allowlist %j as deny-all',
    (MEET_AI_ENABLED_WORKSPACE_IDS) => {
      const env = { MEET_AI_ENABLED_WORKSPACE_IDS };
      expect(isMeetAiEnabledForWorkspace(team, env)).toBe(false);
      expect(isMeetAiEnabledForWorkspace(other, env)).toBe(false);
    }
  );
  it('admits only listed workspaces while the legacy allowlist is present', () => {
    const env = { MEET_AI_ENABLED_WORKSPACE_IDS: team };
    expect(isMeetAiEnabledForWorkspace(team, env)).toBe(true);
    expect(isMeetAiEnabledForWorkspace(other, env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace(other, {})).toBe(true);
  });
  it('applies deny before legacy allow and matches case and separators', () => {
    const env = {
      MEET_AI_DISABLED_WORKSPACE_IDS: ` ${team.toUpperCase()},${team}\n`,
      MEET_AI_ENABLED_WORKSPACE_IDS: `${team},${other}`,
    };
    expect(isMeetAiEnabledForWorkspace(team, env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace(other, env)).toBe(true);
    expect(isMeetAiEnabledForWorkspace(null, {})).toBe(false);
  });
  it.each([
    { MEET_AI_DISABLED: true },
    { MEET_AI_DISABLED_WORKSPACE_IDS: 1 },
    { MEET_AI_DISABLED_WORKSPACE_IDS: '*' },
    { MEET_AI_DISABLED_WORKSPACE_IDS: `${team},garbage` },
  ])('fails closed on malformed controls %j', async (env) => {
    mocks.context.mockResolvedValue({ env });
    expect(await meetAiAvailable(team)).toBe(false);
  });
  it('does not read ambient process env in the Worker', async () => {
    vi.stubEnv('MEET_AI_DISABLED', 'true');
    mocks.context.mockResolvedValue({ env: {} });
    expect(await meetAiAvailable(team)).toBe(true);
    mocks.context.mockRejectedValue(new Error('no context'));
    expect(await meetAiAvailable(team)).toBe(true);
    vi.unstubAllEnvs();
  });
});
