import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));

import {
  isMeetAiEnabledForWorkspace,
  meetAiAvailable,
  meetAiEnabledWorkspaceIds,
  meetAiGateEnv,
} from './workspace-gate';

const team = '00000000-0000-4000-8000-0000000000aa';
const other = '00000000-0000-4000-8000-0000000000bb';
const bind = (value?: string) => ({
  env: { MEET_AI_ENABLED_WORKSPACE_IDS: value },
});

describe('Meet AI workspace allowlist', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });
  it('denies every workspace when unset or blank', () => {
    expect(isMeetAiEnabledForWorkspace(team, {})).toBe(false);
    expect(isMeetAiEnabledForWorkspace(team, undefined)).toBe(false);
    for (const value of ['', '  ', ',', ' , ']) {
      expect(
        isMeetAiEnabledForWorkspace(team, {
          MEET_AI_ENABLED_WORKSPACE_IDS: value,
        })
      ).toBe(false);
    }
  });
  it('allows only listed workspaces, ignoring case and padding', () => {
    const env = { MEET_AI_ENABLED_WORKSPACE_IDS: ` ${team.toUpperCase()}, x ` };
    expect(isMeetAiEnabledForWorkspace(team, env)).toBe(true);
    expect(isMeetAiEnabledForWorkspace(other, env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace('', env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace(null, env)).toBe(false);
  });
  it('tolerates duplicate and mixed-separator ids', () => {
    const ids = meetAiEnabledWorkspaceIds({
      MEET_AI_ENABLED_WORKSPACE_IDS: `${team},${team}\n${other}  ${team.toUpperCase()}`,
    });
    expect([...ids].sort()).toEqual([team, other]);
    expect(
      isMeetAiEnabledForWorkspace(other, {
        MEET_AI_ENABLED_WORKSPACE_IDS: `${team},${team}`,
      })
    ).toBe(false);
  });
  it('has no wildcard and ignores non-string bindings', () => {
    for (const wildcard of ['*', 'all', 'true']) {
      expect(
        isMeetAiEnabledForWorkspace(team, {
          MEET_AI_ENABLED_WORKSPACE_IDS: wildcard,
        })
      ).toBe(false);
    }
    expect(
      isMeetAiEnabledForWorkspace(team, { MEET_AI_ENABLED_WORKSPACE_IDS: 1 })
    ).toBe(false);
  });
  it('reads the Worker env binding', async () => {
    mocks.context.mockResolvedValue(bind(team));
    expect(await meetAiAvailable(team)).toBe(true);
    expect(await meetAiAvailable(other)).toBe(false);
  });
  it('denies when the Worker config is absent even if ambient process.env lists the workspace', async () => {
    vi.stubEnv('MEET_AI_ENABLED_WORKSPACE_IDS', team);
    mocks.context.mockResolvedValue(bind(undefined));
    expect(await meetAiAvailable(team)).toBe(false);
    mocks.context.mockRejectedValue(new Error('no Cloudflare context'));
    expect(await meetAiGateEnv()).toBeUndefined();
    expect(await meetAiAvailable(team)).toBe(false);
  });
});
