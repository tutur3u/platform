import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { assertNotesVoiceAiEnabled } from './ai-gate';
import { NotesVoiceError } from './schema';

const WS = '0b4ad3c4-6f51-4b1e-9a4c-0d6f7f1e2a10';
const OTHER = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const CONTROLS = [
  'MEET_AI_DISABLED',
  'MEET_AI_DISABLED_WORKSPACE_IDS',
  'MEET_AI_ENABLED_WORKSPACE_IDS',
] as const;

function refusal(env: Record<string, string | undefined>) {
  try {
    assertNotesVoiceAiEnabled(WS, env);
    return null;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  for (const name of CONTROLS) delete process.env[name];
});

describe('Notes voice honours the Meet AI controls', () => {
  it.each([
    ['the kill switch is set', { MEET_AI_DISABLED: 'true' }],
    ['the kill switch has any non-false value', { MEET_AI_DISABLED: 'yes' }],
    ['the workspace is denylisted', { MEET_AI_DISABLED_WORKSPACE_IDS: WS }],
    ['the denylist is malformed', { MEET_AI_DISABLED_WORKSPACE_IDS: 'oops' }],
    [
      'the allowlist is present but blank',
      { MEET_AI_ENABLED_WORKSPACE_IDS: '' },
    ],
    [
      'the allowlist omits the workspace',
      { MEET_AI_ENABLED_WORKSPACE_IDS: OTHER },
    ],
  ])('refuses with a stable 403 when %s', (_label, env) => {
    const error = refusal(env);
    expect(error).toBeInstanceOf(NotesVoiceError);
    expect(error).toMatchObject({
      status: 403,
      code: 'notes_voice_ai_disabled',
    });
  });

  it.each([
    ['no control is set', {}],
    ['the kill switch is explicitly off', { MEET_AI_DISABLED: 'false' }],
    [
      'another workspace is denylisted',
      { MEET_AI_DISABLED_WORKSPACE_IDS: OTHER },
    ],
    [
      'the allowlist names the workspace',
      { MEET_AI_ENABLED_WORKSPACE_IDS: WS },
    ],
  ])('allows when %s', (_label, env) => {
    expect(refusal(env)).toBeNull();
  });

  it('reads the server environment by default', () => {
    process.env.MEET_AI_DISABLED = 'true';
    expect(() => assertNotesVoiceAiEnabled(WS)).toThrow(NotesVoiceError);
  });
});
