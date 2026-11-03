import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isMeetAiEnabledForWorkspace,
  meetAiEnabledWorkspaceIds,
  resetMeetAiGateWarnings,
} from './ai-workspace-gate';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const OTHER = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const EC = '00000000-0000-4000-8000-0000000000ee';
const allow = (ids: string) => ({
  MEET_AI_PROTECTED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000ee',
  MEET_AI_ENABLED_WORKSPACE_IDS: ids,
});

describe('Meet AI workspace gate (default-off, allowlist-only)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetMeetAiGateWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('uses a synthetic protected workspace fixture', () => {
    expect(EC).toBe('00000000-0000-4000-8000-0000000000ee');
  });

  it.each([
    ['no env', undefined],
    ['null env', null],
    ['empty env', {}],
    ['kill switch off only', { MEET_AI_DISABLED: 'false' }],
    ['denylist only', { MEET_AI_DISABLED_WORKSPACE_IDS: OTHER }],
    ['allowlist key with undefined value', allow(undefined as never)],
  ])('denies every workspace with a missing allowlist (%s)', (_, env) => {
    for (const ws of [WS, OTHER, EC])
      expect(isMeetAiEnabledForWorkspace(ws, env)).toBe(false);
  });

  it.each(['', ' ', '\n\t', ' , ,'])(
    'denies every workspace with an empty allowlist %j',
    (ids) => {
      for (const ws of [WS, OTHER, EC])
        expect(isMeetAiEnabledForWorkspace(ws, allow(ids))).toBe(false);
    }
  );

  it.each(['*', ` * `, `*,${WS}`, `${WS} *`])(
    "denies every workspace and logs for a '*' allowlist %j",
    (ids) => {
      expect(isMeetAiEnabledForWorkspace(WS, allow(ids))).toBe(false);
      expect(isMeetAiEnabledForWorkspace(OTHER, allow(ids))).toBe(false);
      expect(meetAiEnabledWorkspaceIds(allow(ids)).size).toBe(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("'*'"));
    }
  );

  it.each([
    'all',
    '.*',
    '*.*',
    `${WS.slice(0, 8)}*`,
    `${WS},garbage`,
    `${WS};${OTHER}`,
  ])('denies every workspace and logs for a malformed allowlist %j', (ids) => {
    expect(isMeetAiEnabledForWorkspace(WS, allow(ids))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('non-UUID'));
  });

  it.each([1, true, null, { ids: WS }, [WS]])(
    'denies every workspace for a non-string allowlist %j',
    (ids) => {
      expect(
        isMeetAiEnabledForWorkspace(WS, {
          MEET_AI_PROTECTED_WORKSPACE_IDS:
            '00000000-0000-4000-8000-0000000000ee',
          MEET_AI_ENABLED_WORKSPACE_IDS: ids,
        })
      ).toBe(false);
    }
  );

  it('allows only explicitly listed workspaces, matching case and separators', () => {
    const env = allow(` ${WS.toUpperCase()},\n${OTHER} `);
    expect(isMeetAiEnabledForWorkspace(WS, env)).toBe(true);
    expect(isMeetAiEnabledForWorkspace(` ${OTHER.toUpperCase()} `, env)).toBe(
      true
    );
    expect(
      isMeetAiEnabledForWorkspace('11111111-1111-4111-8111-111111111111', env)
    ).toBe(false);
  });

  it('denies a missing or blank workspace id', () => {
    for (const ws of [null, undefined, '', '   '])
      expect(isMeetAiEnabledForWorkspace(ws, allow(WS))).toBe(false);
  });

  it('denies Easy Center by the protected secret even when it is the only allowlisted id', () => {
    for (const env of [
      allow(EC),
      allow(EC.toUpperCase()),
      allow(`${WS},${EC}`),
      { ...allow(EC), MEET_AI_DISABLED: 'false' },
      { ...allow(EC), MEET_AI_DISABLED_WORKSPACE_IDS: '' },
    ]) {
      expect(isMeetAiEnabledForWorkspace(EC, env)).toBe(false);
      expect(isMeetAiEnabledForWorkspace(EC.toUpperCase(), env)).toBe(false);
      expect(isMeetAiEnabledForWorkspace(` ${EC} `, env)).toBe(false);
    }
    // Other listed workspaces are unaffected.
    expect(isMeetAiEnabledForWorkspace(WS, allow(`${WS},${EC}`))).toBe(true);
  });

  it.each(['1', 'true', ' TRUE ', '', 'garbage', 'off', 'no'])(
    'kill switch %j denies every listed workspace',
    (MEET_AI_DISABLED) => {
      const env = { ...allow(`${WS},${OTHER}`), MEET_AI_DISABLED };
      expect(isMeetAiEnabledForWorkspace(WS, env)).toBe(false);
      expect(isMeetAiEnabledForWorkspace(OTHER, env)).toBe(false);
    }
  );

  it.each([true, 1, 0, null, {}])(
    'non-string kill switch %j denies every workspace',
    (MEET_AI_DISABLED) => {
      expect(
        isMeetAiEnabledForWorkspace(WS, { ...allow(WS), MEET_AI_DISABLED })
      ).toBe(false);
    }
  );

  it.each(['0', 'false', ' FALSE '])(
    'kill switch %j is off and leaves the allowlist in charge',
    (MEET_AI_DISABLED) => {
      expect(
        isMeetAiEnabledForWorkspace(WS, { ...allow(WS), MEET_AI_DISABLED })
      ).toBe(true);
      expect(isMeetAiEnabledForWorkspace(WS, { MEET_AI_DISABLED })).toBe(false);
    }
  );

  it('denylist beats the allowlist and matches case and separators', () => {
    const env = {
      ...allow(`${WS},${OTHER}`),
      MEET_AI_DISABLED_WORKSPACE_IDS: ` ${WS.toUpperCase()}\n`,
    };
    expect(isMeetAiEnabledForWorkspace(WS, env)).toBe(false);
    expect(isMeetAiEnabledForWorkspace(OTHER, env)).toBe(true);
  });

  it.each(['*', 'garbage', `${OTHER},garbage`, 1, true, null])(
    'malformed denylist %j denies every workspace',
    (denied) => {
      expect(
        isMeetAiEnabledForWorkspace(WS, {
          ...allow(WS),
          MEET_AI_DISABLED_WORKSPACE_IDS: denied,
        })
      ).toBe(false);
    }
  );

  it.each([undefined, '', ' ', '*', `${EC},garbage`, null, [EC]])(
    'denies even allowlisted workspaces with unusable protected config %j',
    (value) => {
      expect(
        isMeetAiEnabledForWorkspace(WS, {
          ...allow(WS),
          MEET_AI_PROTECTED_WORKSPACE_IDS: value,
        })
      ).toBe(false);
    }
  );
  it('ignores inherited control bindings', () => {
    expect(isMeetAiEnabledForWorkspace(WS, Object.create(allow(WS)))).toBe(
      false
    );
    const env = Object.assign(
      Object.create({ MEET_AI_DISABLED: 'true' }),
      allow(WS)
    );
    expect(isMeetAiEnabledForWorkspace(WS, env)).toBe(true);
  });

  it('logs each misconfiguration once per isolate without workspace ids', () => {
    for (let i = 0; i < 3; i++)
      isMeetAiEnabledForWorkspace(WS, allow(`*,${WS}`));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(WS);
  });
});
