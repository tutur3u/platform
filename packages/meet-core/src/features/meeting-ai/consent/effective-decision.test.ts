import { describe, expect, it } from 'vitest';
import { effectiveSelfDecision, isNoticeOutdated } from './effective-decision';
import { MEET_CONSENT_NOTICE_VERSION } from './notice';

const own = (
  decision: 'allow' | 'deny' | 'withdraw' | null,
  available = true
) => ({
  available,
  noticeVersion: MEET_CONSENT_NOTICE_VERSION,
  decision,
});

describe('effective own consent decision', () => {
  it('lets the legal record override the room mirror', () => {
    // Allowed before a notice change: the room still says true, the record
    // reports no current decision, so the participant is asked again.
    expect(effectiveSelfDecision(true, own(null))).toBeUndefined();
    expect(effectiveSelfDecision(true, own('allow'))).toBe(true);
    expect(effectiveSelfDecision(true, own('withdraw'))).toBe(false);
    expect(effectiveSelfDecision(undefined, own('deny'))).toBe(false);
  });

  it('uses the room value until the record loads or when the log is missing', () => {
    expect(effectiveSelfDecision(true, undefined)).toBe(true);
    expect(effectiveSelfDecision(undefined, undefined)).toBeUndefined();
    expect(effectiveSelfDecision(false, own(null, false))).toBe(false);
  });

  it('flags a bundle whose notice differs from the server', () => {
    expect(isNoticeOutdated(undefined, MEET_CONSENT_NOTICE_VERSION)).toBe(
      false
    );
    expect(
      isNoticeOutdated(
        { noticeVersion: MEET_CONSENT_NOTICE_VERSION },
        MEET_CONSENT_NOTICE_VERSION
      )
    ).toBe(false);
    expect(
      isNoticeOutdated(
        { noticeVersion: 'meet-transcription-v9' },
        MEET_CONSENT_NOTICE_VERSION
      )
    ).toBe(true);
  });
});
