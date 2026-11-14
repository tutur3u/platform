import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { EASY_CENTER_WORKSPACE_ID } from '@tuturuuu/realtime/meet';
import { assertNotesVoiceAiEnabled } from './ai-gate';
import { NotesVoiceError } from './schema';

const WS = '0b4ad3c4-6f51-4b1e-9a4c-0d6f7f1e2a10';
const OTHER = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const CONTROLS = [
  'MEET_AI_DISABLED',
  'MEET_AI_PROTECTED_WORKSPACE_IDS',
  'MEET_AI_DISABLED_WORKSPACE_IDS',
  'MEET_AI_ENABLED_WORKSPACE_IDS',
] as const;

function refusal(env: Record<string, string | undefined>, wsId = WS) {
  try {
    assertNotesVoiceAiEnabled(wsId, env);
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * Kill switch explicitly off, protected list, and this workspace on the
 * enabled list. Anything else denies (an absent kill switch denies too).
 */
function enabled(
  extra: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    MEET_AI_DISABLED: 'false',
    MEET_AI_PROTECTED_WORKSPACE_IDS: OTHER,
    MEET_AI_ENABLED_WORKSPACE_IDS: WS,
    ...extra,
  };
}

function expectDenied(error: unknown) {
  expect(error).toBeInstanceOf(NotesVoiceError);
  expect(error).toMatchObject({
    status: 403,
    code: 'notes_voice_ai_disabled',
  });
}

afterEach(() => {
  for (const name of CONTROLS) delete process.env[name];
});

describe('Notes voice honours the shared Meet AI gate', () => {
  it.each(['true', 'yes', '1', ''])(
    'denies when the kill switch is %j',
    (value) => {
      expectDenied(refusal(enabled({ MEET_AI_DISABLED: value })));
    }
  );

  it.each(['false', '0'])(
    'allows when the kill switch is %j and the workspace is enabled',
    (value) => {
      expect(refusal(enabled({ MEET_AI_DISABLED: value }))).toBeNull();
    }
  );

  it('denies when the kill switch is absent even if the workspace is enabled', () => {
    const env = enabled();
    delete env.MEET_AI_DISABLED;
    expectDenied(refusal(env));
  });

  it('denies when the workspace is denylisted', () => {
    expectDenied(refusal(enabled({ MEET_AI_DISABLED_WORKSPACE_IDS: WS })));
  });

  it('denies when the denylist is malformed', () => {
    expectDenied(refusal(enabled({ MEET_AI_DISABLED_WORKSPACE_IDS: 'oops' })));
  });

  it('allows when another workspace is denylisted', () => {
    expect(
      refusal(enabled({ MEET_AI_DISABLED_WORKSPACE_IDS: OTHER }))
    ).toBeNull();
  });

  it('denies when the protected list is missing', () => {
    const env = enabled();
    delete env.MEET_AI_PROTECTED_WORKSPACE_IDS;
    expectDenied(refusal(env));
  });

  it.each(['oops', '', '*'])(
    'denies when the protected list is invalid %j',
    (value) => {
      expectDenied(
        refusal(enabled({ MEET_AI_PROTECTED_WORKSPACE_IDS: value }))
      );
    }
  );

  it('denies when the protected list names the workspace', () => {
    expectDenied(refusal(enabled({ MEET_AI_PROTECTED_WORKSPACE_IDS: WS })));
  });

  it('allows when the enabled list names the workspace', () => {
    expect(refusal(enabled())).toBeNull();
  });

  it.each(['', OTHER])(
    'denies when the enabled list does not name the workspace %j',
    (value) => {
      expectDenied(refusal(enabled({ MEET_AI_ENABLED_WORKSPACE_IDS: value })));
    }
  );

  it('denies when no control is set', () => {
    expectDenied(refusal({}));
  });

  it('denies Easy Center even when its id is on the enabled list', () => {
    const env = enabled({
      MEET_AI_DISABLED: 'false',
      MEET_AI_ENABLED_WORKSPACE_IDS: `${EASY_CENTER_WORKSPACE_ID},${WS}`,
    });
    expectDenied(refusal(env, EASY_CENTER_WORKSPACE_ID));
    expect(refusal(env, WS)).toBeNull();
  });

  it('reads the server environment by default', () => {
    process.env.MEET_AI_DISABLED = 'true';
    expect(() => assertNotesVoiceAiEnabled(WS)).toThrow(NotesVoiceError);
  });
});
