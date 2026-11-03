import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));

import {
  isMeetAiEnabledForWorkspace,
  meetAiAvailable,
  meetAiGateEnv,
  meetAiWorkerEnv,
} from './workspace-gate';

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
    { MEET_AI_ENABLED_WORKSPACE_IDS: '' },
    { MEET_AI_ENABLED_WORKSPACE_IDS: '*' },
  ])(
    'denies by default without an explicit allowlist entry: %j',
    async (env) => {
      mocks.context.mockResolvedValue({ env });
      expect(await meetAiAvailable(team)).toBe(false);
    }
  );
  it('allows an explicitly listed workspace', async () => {
    mocks.context.mockResolvedValue({
      env: { MEET_AI_ENABLED_WORKSPACE_IDS: team, MEET_AI_DISABLED: 'false' },
    });
    expect(await meetAiAvailable(team)).toBe(true);
    expect(await meetAiAvailable(other)).toBe(false);
  });
  it.each(['1', 'true', ' TRUE ', '', 'garbage'])(
    'denies switch %j',
    async (MEET_AI_DISABLED) => {
      mocks.context.mockResolvedValue({
        env: { MEET_AI_DISABLED, MEET_AI_ENABLED_WORKSPACE_IDS: team },
      });
      expect(await meetAiAvailable(team)).toBe(false);
    }
  );
  it.each(['', ' ', '\n', ' , '])(
    'treats a blank allowlist %j as deny-all',
    (MEET_AI_ENABLED_WORKSPACE_IDS) => {
      const env = { MEET_AI_ENABLED_WORKSPACE_IDS };
      expect(isMeetAiEnabledForWorkspace(team, env)).toBe(false);
      expect(isMeetAiEnabledForWorkspace(other, env)).toBe(false);
    }
  );
  it('admits only listed workspaces', () => {
    const env = { MEET_AI_ENABLED_WORKSPACE_IDS: team };
    expect(isMeetAiEnabledForWorkspace(team, env)).toBe(true);
    expect(isMeetAiEnabledForWorkspace(other, env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace(other, {})).toBe(false);
  });
  it('applies deny before allow and matches case and separators', () => {
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
  ])('fails closed on malformed controls %j', async (controls) => {
    mocks.context.mockResolvedValue({
      env: { MEET_AI_ENABLED_WORKSPACE_IDS: team, ...controls },
    });
    expect(await meetAiAvailable(team)).toBe(false);
  });
  it('does not read ambient process env in the Worker', async () => {
    vi.stubEnv('MEET_AI_DISABLED', 'false');
    vi.stubEnv('MEET_AI_ENABLED_WORKSPACE_IDS', team);
    mocks.context.mockResolvedValue({ env: {} });
    expect(await meetAiAvailable(team)).toBe(false);
    vi.stubEnv('MEET_AI_DISABLED', 'true');
    mocks.context.mockResolvedValue({
      env: { MEET_AI_ENABLED_WORKSPACE_IDS: team },
    });
    expect(await meetAiAvailable(team)).toBe(true);
    vi.unstubAllEnvs();
  });
  it('fails closed as the kill switch when the Worker context is missing', async () => {
    vi.stubEnv('MEET_AI_ENABLED_WORKSPACE_IDS', team);
    mocks.context.mockRejectedValue(new Error('no context'));
    expect(await meetAiGateEnv()).toEqual({ MEET_AI_DISABLED: 'true' });
    expect(await meetAiAvailable(team)).toBe(false);
    mocks.context.mockResolvedValue({ env: undefined });
    expect(await meetAiAvailable(team)).toBe(false);
    expect(await meetAiWorkerEnv()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
