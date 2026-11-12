/** Display revision only; no consent or server acknowledgement is recorded. */
export const MEET_AI_NOTICE_VERSION = 1;

export type MeetAiDisclosure =
  | { kind: 'hidden' | 'off' | 'error' | 'available' }
  | { kind: 'active'; transcription: boolean; mira: boolean };

export function meetAiDisclosure(input: {
  available: boolean | undefined;
  failed: boolean;
  transcriptionActive: boolean;
  miraActive: boolean;
}): MeetAiDisclosure {
  if (input.transcriptionActive || input.miraActive)
    return {
      kind: 'active',
      transcription: input.transcriptionActive,
      mira: input.miraActive,
    };
  if (input.failed) return { kind: 'error' };
  if (input.available === false) return { kind: 'off' };
  if (input.available === true) return { kind: 'available' };
  return { kind: 'hidden' };
}
