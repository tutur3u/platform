import type { MeetConsentDecision } from './notice';

export type OwnConsent = {
  available: boolean;
  noticeVersion: string;
  decision: MeetConsentDecision | null;
};

/**
 * The participant's own decision for the prompt and the mic badge. The legal
 * record is authoritative: an allow made under another notice version arrives
 * as `null`, so the participant is asked again even though the room still
 * mirrors the old `true`. The room value is used only until the record has
 * loaded or when the log is not deployed.
 */
export function effectiveSelfDecision(
  room: boolean | undefined,
  own: OwnConsent | undefined
): boolean | undefined {
  if (!own?.available) return room;
  if (own.decision === null) return undefined;
  return own.decision === 'allow';
}

/** True when this bundle shows a different notice than the server records. */
export function isNoticeOutdated(
  own: Pick<OwnConsent, 'noticeVersion'> | undefined,
  bundled: string
) {
  return !!own?.noticeVersion && own.noticeVersion !== bundled;
}
