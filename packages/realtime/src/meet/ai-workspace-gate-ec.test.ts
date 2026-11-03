import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isMeetAiEnabledForWorkspace,
  meetAiSafeEnvironment,
} from './ai-workspace-gate';

const MEET_AI_EC_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const protectedIds = {
  MEET_AI_PROTECTED_WORKSPACE_IDS: MEET_AI_EC_WORKSPACE_ID,
};
const ordinary = '11111111-1111-4111-8111-111111111111';
describe('EC runtime safety check', () => {
  it('keeps ordinary workspaces off when EC would be admitted', () => {
    expect(
      isMeetAiEnabledForWorkspace(ordinary, meetAiSafeEnvironment({}))
    ).toBe(false);
  });
  it('accepts effective denial by an allowlist without a denylist', () => {
    const env = { ...protectedIds, MEET_AI_ENABLED_WORKSPACE_IDS: ordinary };
    expect(
      isMeetAiEnabledForWorkspace(
        MEET_AI_EC_WORKSPACE_ID,
        meetAiSafeEnvironment(env)
      )
    ).toBe(false);
    expect(
      isMeetAiEnabledForWorkspace(ordinary, meetAiSafeEnvironment(env))
    ).toBe(true);
  });
  for (const allow of [undefined, ordinary, '*']) {
    for (const kill of ['true', 'false', '0']) {
      it(`denies EC with allow=${allow} kill=${kill}`, () => {
        const env = {
          ...protectedIds,
          MEET_AI_ENABLED_WORKSPACE_IDS: allow,
          MEET_AI_DISABLED: kill,
          MEET_AI_DISABLED_WORKSPACE_IDS: ` \n${MEET_AI_EC_WORKSPACE_ID.toUpperCase()}, `,
        };
        expect(
          isMeetAiEnabledForWorkspace(
            MEET_AI_EC_WORKSPACE_ID,
            meetAiSafeEnvironment(env)
          )
        ).toBe(false);
      });
    }
  }
  it.each([
    undefined,
    '',
    ' ',
    '*',
    'broken',
    `${MEET_AI_EC_WORKSPACE_ID},broken`,
  ])('fails closed on missing or malformed protected secret %s', (value) => {
    expect(
      isMeetAiEnabledForWorkspace(
        ordinary,
        meetAiSafeEnvironment({ MEET_AI_PROTECTED_WORKSPACE_IDS: value })
      )
    ).toBe(false);
  });
  it.each([undefined, '*', MEET_AI_EC_WORKSPACE_ID])(
    'disables AI when protected id is admitted or wildcard is used %s',
    (allow) => {
      expect(
        isMeetAiEnabledForWorkspace(
          ordinary,
          meetAiSafeEnvironment({
            ...protectedIds,
            MEET_AI_ENABLED_WORKSPACE_IDS: allow,
          })
        )
      ).toBe(false);
    }
  );
  it('rechecks a kill-switch transition instead of caching a prior safe result', () => {
    const env = { ...protectedIds, MEET_AI_DISABLED: 'true' };
    expect(
      isMeetAiEnabledForWorkspace(
        MEET_AI_EC_WORKSPACE_ID,
        meetAiSafeEnvironment(env)
      )
    ).toBe(false);
    env.MEET_AI_DISABLED = 'false';
    expect(
      isMeetAiEnabledForWorkspace(ordinary, meetAiSafeEnvironment(env))
    ).toBe(false);
  });
  it('never throws for broken bindings and refuses AI', () => {
    const env = new Proxy(
      {},
      {
        has() {
          throw new Error('fixture');
        },
      }
    );
    expect(() => meetAiSafeEnvironment(env)).not.toThrow();
    expect(
      isMeetAiEnabledForWorkspace(ordinary, meetAiSafeEnvironment(env))
    ).toBe(false);
  });
  for (const path of [
    'apps/meet/wrangler.legacy.jsonc',
    'apps/meet-realtime/wrangler.jsonc',
    'apps/web/vercel.json',
  ]) {
    it(`checks the deployed configuration at ${path}`, () => {
      const config = JSON.parse(
        readFileSync(resolve(__dirname, '../../../../', path), 'utf8')
          .replace(/^\s*\/\/.*$/gm, '')
          .replace(/,\s*([}\]])/g, '$1')
      );
      expect(
        isMeetAiEnabledForWorkspace(
          MEET_AI_EC_WORKSPACE_ID,
          meetAiSafeEnvironment(config.vars ?? config.env ?? {})
        )
      ).toBe(false);
    });
  }
});
