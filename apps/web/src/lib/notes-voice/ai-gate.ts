import 'server-only';

import {
  isMeetAiEnabledForWorkspace,
  MEET_AI_DISABLED_ENV,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  MEET_AI_WORKSPACE_DENYLIST_ENV,
} from '@tuturuuu/realtime/meet';
import { NotesVoiceError } from './schema';

/**
 * Notes voice uses the Meet AI transcription model, so it obeys the same
 * runtime controls: the kill switch, the workspace denylist and the legacy
 * allowlist. Only the controls are copied, so no other env reaches the gate.
 */
export function assertNotesVoiceAiEnabled(
  wsId: string,
  env: Record<string, string | undefined> = process.env
) {
  const controls = Object.fromEntries(
    [
      MEET_AI_DISABLED_ENV,
      MEET_AI_WORKSPACE_DENYLIST_ENV,
      MEET_AI_WORKSPACE_ALLOWLIST_ENV,
    ]
      .filter((name) => env[name] !== undefined)
      .map((name) => [name, env[name]])
  );
  if (!isMeetAiEnabledForWorkspace(wsId, controls))
    throw new NotesVoiceError(403, 'notes_voice_ai_disabled');
}
