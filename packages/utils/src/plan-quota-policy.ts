export const PLAN_QUOTA_VERSION = '2026-11-26';

export type VersionedPlanTier = 'FREE' | 'PLUS' | 'PRO' | 'MAX' | 'ULTRA';

type MonthlyAiCredits =
  | { readonly kind: 'actor'; readonly credits: number }
  | {
      readonly kind: 'per-seat';
      readonly credits: number;
      readonly baseCredits: number | null;
    };

type PlanQuota = {
  readonly monthlyAiCredits: MonthlyAiCredits;
  readonly privateVoiceMonthlySeconds: number;
  readonly taskBoardsPerWorkspace: number;
  readonly driveGiB: number;
  readonly meetMonthlyParticipantMinutes: number;
  readonly meetMonthlyTranscribedAudioMinutes: number;
  readonly monthlyFormSubmissions: number;
  readonly monthlyStandardAutomationRuns: number;
};

// Drive is per workspace on Free and per pooled paid seat otherwise.
// AI is actor-wide on Free and allocated per paid seat otherwise.
export const PLAN_QUOTAS = {
  FREE: quota({ kind: 'actor', credits: 10_000 }, 10, 15, 2, 120, 15, 100),
  PLUS: quota(
    { kind: 'per-seat', credits: 40_000, baseCredits: 50_000 },
    35,
    60,
    30,
    450,
    90,
    500
  ),
  PRO: quota(
    { kind: 'per-seat', credits: 120_000, baseCredits: 150_000 },
    75,
    120,
    120,
    1_200,
    240,
    2_000
  ),
  MAX: quota(
    { kind: 'per-seat', credits: 750_000, baseCredits: null },
    240,
    300,
    500,
    3_600,
    900,
    8_000
  ),
  ULTRA: quota(
    { kind: 'per-seat', credits: 1_600_000, baseCredits: null },
    480,
    600,
    1_000,
    7_500,
    1_800,
    20_000
  ),
} satisfies Record<VersionedPlanTier, PlanQuota>;

function quota(
  monthlyAiCredits: MonthlyAiCredits,
  privateVoiceMonthlyMinutes: number,
  taskBoardsPerWorkspace: number,
  driveGiB: number,
  meetMonthlyParticipantMinutes: number,
  meetMonthlyTranscribedAudioMinutes: number,
  monthlyRunsPerMeter: number
): PlanQuota {
  return {
    monthlyAiCredits,
    privateVoiceMonthlySeconds: privateVoiceMonthlyMinutes * 60,
    taskBoardsPerWorkspace,
    driveGiB,
    meetMonthlyParticipantMinutes,
    meetMonthlyTranscribedAudioMinutes,
    monthlyFormSubmissions: monthlyRunsPerMeter,
    monthlyStandardAutomationRuns: monthlyRunsPerMeter,
  };
}

export type PlanEnrollment = Readonly<{
  version: typeof PLAN_QUOTA_VERSION;
  tier: VersionedPlanTier;
}>;

export function resolvePlanQuota(enrollment: PlanEnrollment | null) {
  if (enrollment?.version !== PLAN_QUOTA_VERSION) return null;

  return {
    limits: PLAN_QUOTAS[enrollment.tier],
    aiScope: enrollment.tier === 'FREE' ? 'actor' : 'paid-seat',
    renewalInterval: 'monthly',
    automaticOverage: false,
  } as const;
}
