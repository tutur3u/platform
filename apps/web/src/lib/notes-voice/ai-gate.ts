import 'server-only';

import {
  isMeetAiEnabledForWorkspace,
  MEET_AI_DISABLED_ENV,
  MEET_AI_PROTECTED_WORKSPACES_ENV,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  MEET_AI_WORKSPACE_DENYLIST_ENV,
} from '@tuturuuu/realtime/meet';
import { NotesVoiceError } from './schema';

/**
 * Notes voice uses the Meet AI transcription model, so it calls the shared
 * default-off gate. Only the four Meet AI controls are forwarded.
 */
export function assertNotesVoiceAiEnabled(
  wsId: string,
  env: Record<string, string | undefined> = process.env
) {
  const controls = Object.fromEntries(
    [
      MEET_AI_DISABLED_ENV,
      MEET_AI_PROTECTED_WORKSPACES_ENV,
      MEET_AI_WORKSPACE_DENYLIST_ENV,
      MEET_AI_WORKSPACE_ALLOWLIST_ENV,
    ].map((name) => [name, env[name]])
  );
  if (!isMeetAiEnabledForWorkspace(wsId, controls))
    throw new NotesVoiceError(403, 'notes_voice_ai_disabled');
}
