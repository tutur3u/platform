import { describe, expect, it } from 'vitest';
import {
  buildReferralSettingsPayload,
  isReferralProgramFormValid,
  referralProgramFormFromSettings,
} from './referral-program-form';

describe('referral program form', () => {
  it('creates safe defaults when the workspace has not configured referrals', () => {
    expect(referralProgramFormFromSettings(null)).toEqual({
      countCap: '3',
      incrementPercent: '5',
      promotionId: '',
      rewardType: 'REFERRER',
    });
  });

  it('rejects non-integer caps and negative percentages', () => {
    expect(
      isReferralProgramFormValid({
        countCap: '2.5',
        incrementPercent: '5',
        promotionId: '',
        rewardType: 'BOTH',
      })
    ).toBe(false);
    expect(
      isReferralProgramFormValid({
        countCap: '3',
        incrementPercent: '-1',
        promotionId: '',
        rewardType: 'BOTH',
      })
    ).toBe(false);
  });

  it('builds the referral settings API payload', () => {
    expect(
      buildReferralSettingsPayload({
        countCap: '8',
        incrementPercent: '7.5',
        promotionId: 'promotion-1',
        rewardType: 'BOTH',
      })
    ).toEqual({
      referral_count_cap: 8,
      referral_increment_percent: 7.5,
      referral_promotion_id: 'promotion-1',
      referral_reward_type: 'BOTH',
    });
  });
});
