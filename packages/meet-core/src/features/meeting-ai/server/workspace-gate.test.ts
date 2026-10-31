import { describe, expect, it } from 'vitest';
import {
  isMeetAiEnabledForWorkspace,
  meetAiEnabledWorkspaceIds,
} from './workspace-gate';

const team = '00000000-0000-4000-8000-0000000000aa';
const other = '00000000-0000-4000-8000-0000000000bb';

describe('Meet AI workspace allowlist', () => {
  it('denies every workspace when unset or blank', () => {
    expect(isMeetAiEnabledForWorkspace(team, {})).toBe(false);
    for (const value of ['', '  ', ',', ' , ']) {
      expect(
        isMeetAiEnabledForWorkspace(team, {
          MEET_AI_ENABLED_WORKSPACE_IDS: value,
        })
      ).toBe(false);
    }
  });
  it('allows only listed workspaces', () => {
    const env = { MEET_AI_ENABLED_WORKSPACE_IDS: ` ${team.toUpperCase()}, x ` };
    expect(isMeetAiEnabledForWorkspace(team, env)).toBe(true);
    expect(isMeetAiEnabledForWorkspace(other, env)).toBe(false);
  });
  it('supports whitespace separators and has no wildcard', () => {
    expect([
      ...meetAiEnabledWorkspaceIds({
        MEET_AI_ENABLED_WORKSPACE_IDS: `${team}\n${other}`,
      }),
    ]).toEqual([team, other]);
    for (const wildcard of ['*', 'all', 'true']) {
      expect(
        isMeetAiEnabledForWorkspace(team, {
          MEET_AI_ENABLED_WORKSPACE_IDS: wildcard,
        })
      ).toBe(false);
    }
  });
});
