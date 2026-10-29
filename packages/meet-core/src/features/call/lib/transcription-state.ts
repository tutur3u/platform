import type {
  TranscriptionConsentMessage,
  TranscriptionState,
  TranscriptionStateMessage,
} from '@tuturuuu/realtime/meet';

/** Live room view of transcription; the legal record lives in the database. */
export interface CallTranscription {
  state?: TranscriptionState;
  /** Participant id → allowed. Holds our own decision and, for hosts, others'. */
  consents: Record<string, boolean>;
}

export const INITIAL_CALL_TRANSCRIPTION: CallTranscription = { consents: {} };

export function reduceCallTranscription(
  current: CallTranscription,
  message: TranscriptionStateMessage | TranscriptionConsentMessage
): CallTranscription {
  if (message.type === 'transcription.state') {
    const sameSession =
      message.state.active &&
      current.state?.active &&
      current.state.sessionId === message.state.sessionId;
    return {
      state: message.state,
      consents: sameSession ? current.consents : {},
    };
  }
  if (!current.state?.active) return current;
  return {
    ...current,
    consents: { ...current.consents, [message.userId]: message.allowed },
  };
}

export function isTranscribing(transcription: CallTranscription) {
  return transcription.state?.active === true;
}
