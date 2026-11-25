import { describe, expect, it, vi } from 'vitest';
import { createRuntimeReader } from './runtime-reader';

const key = 'MEET_UX_V2';
const workspaceId = 'aaaaaaaa-0000-4000-8000-000000000001';
const userId = 'bbbbbbbb-0000-4000-8000-000000000001';
const production = { environment: 'production' } as const;
const platformRule = {
  flagKey: key,
  scope: 'platform',
  subjectId: null,
  mode: 'on',
  revision: 1,
};

function setup() {
  let time = 0;
  const snapshot = {
    environment: 'production',
    version: '0123456789abcdef0123456789abcdef',
    rules: [platformRule],
  };
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: snapshot as unknown,
    error: null as { message: string } | null,
  }));
  const reader = createRuntimeReader({
    rpc,
    now: () => time,
    readEnv: () => 'true',
  });
  return {
    reader,
    rpc,
    snapshot,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('runtime reader', () => {
  it('shares one refresh across concurrent reads and refreshes at 60 seconds', async () => {
    const { reader, rpc, advance } = setup();
    const decisions = await Promise.all(
      Array.from({ length: 24 }, () => reader.evaluateFlag(key, production))
    );
    expect(decisions.every(({ enabled }) => enabled)).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('feature_flag_read_snapshot', {
      p_environment: 'production',
    });
    advance(59_999);
    await reader.evaluateFlag(key, production);
    expect(rpc).toHaveBeenCalledTimes(1);
    advance(1);
    await reader.evaluateFlag(key, production);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('serves stale rules on errors and suppresses legacy fallback at expiry for known stored rules', async () => {
    const { reader, rpc, advance } = setup();
    await reader.evaluateFlag(key, production);
    rpc.mockRejectedValue(new Error('offline'));
    advance(60_000);
    expect(await reader.evaluateFlag(key, production)).toMatchObject({
      enabled: true,
      source: 'platform',
    });
    advance(540_000);
    expect(await reader.evaluateFlag(key, production)).toMatchObject({
      enabled: false,
    });
    expect(
      await reader.evaluateFlag('MEET_FORMS_ENABLED', production)
    ).toMatchObject({
      enabled: true,
      source: 'env-fallback',
    });
  });

  it('rejects a malformed snapshot even with a previously valid snapshot and legacy fallback', async () => {
    const { reader, rpc, advance, snapshot } = setup();
    await reader.evaluateFlag(key, production);
    rpc.mockResolvedValue({
      data: { ...snapshot, rules: [platformRule, platformRule] },
      error: null,
    });
    advance(60_000);
    expect(await reader.evaluateFlag(key, production)).toMatchObject({
      enabled: false,
      source: 'invalid-rules',
    });
  });

  it('normalizes subject IDs and shares only the snapshot between requests', async () => {
    const { reader, rpc, snapshot } = setup();
    rpc.mockImplementation(async (name) =>
      name === 'feature_flag_read_snapshot'
        ? { data: snapshot, error: null }
        : {
            data: {
              environment: 'production',
              rules: [
                {
                  ...platformRule,
                  mode: 'off',
                  scope: 'user',
                  subjectId: userId.toUpperCase(),
                },
              ],
            },
            error: null,
          }
    );
    const context = {
      ...production,
      workspaceId: workspaceId.toUpperCase(),
      userId: userId.toUpperCase(),
    };
    const decisions = await reader.evaluateFlags(
      [key, 'MEET_FORMS_ENABLED'],
      context
    );
    expect(decisions.get(key)).toMatchObject({
      enabled: false,
      source: 'user',
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('feature_flag_read_subject_rules', {
      p_environment: 'production',
      p_workspace_id: workspaceId,
      p_user_id: userId,
    });

    rpc.mockResolvedValue({
      data: null,
      error: { message: 'subject read error' },
    });
    expect(await reader.evaluateFlag(key, context)).toMatchObject({
      enabled: false,
      trace: ['subject rules unavailable'],
    });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(await reader.evaluateFlag(key, production)).toMatchObject({
      enabled: true,
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
