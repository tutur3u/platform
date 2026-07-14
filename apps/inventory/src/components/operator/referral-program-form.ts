import type {
  WorkspaceReferralSettings,
  WorkspaceReferralSettingsPayload,
} from '@tuturuuu/internal-api/promotions';

export type ReferralRewardType = 'REFERRER' | 'RECEIVER' | 'BOTH';

export type ReferralProgramForm = {
  countCap: string;
  incrementPercent: string;
  promotionId: string;
  rewardType: ReferralRewardType;
};

export function referralProgramFormFromSettings(
  settings: WorkspaceReferralSettings | null
): ReferralProgramForm {
  return {
    countCap: String(settings?.referral_count_cap ?? 3),
    incrementPercent: String(settings?.referral_increment_percent ?? 5),
    promotionId: settings?.referral_promotion_id ?? '',
    rewardType: settings?.referral_reward_type ?? 'REFERRER',
  };
}

export function isReferralProgramFormValid(form: ReferralProgramForm) {
  const countCap = Number(form.countCap);
  const incrementPercent = Number(form.incrementPercent);

  return (
    Number.isInteger(countCap) &&
    countCap >= 0 &&
    Number.isFinite(incrementPercent) &&
    incrementPercent >= 0
  );
}

export function buildReferralSettingsPayload(
  form: ReferralProgramForm
): WorkspaceReferralSettingsPayload {
  return {
    referral_count_cap: Number(form.countCap),
    referral_increment_percent: Number(form.incrementPercent),
    referral_promotion_id: form.promotionId || null,
    referral_reward_type: form.rewardType,
  };
}
