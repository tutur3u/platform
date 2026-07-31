import type {
  AiStudioPolicy,
  UpdateAiStudioPolicyInput,
} from '@tuturuuu/internal-api/ai-studio';

export type CaptureMode = 'inherit' | 'off' | 'on';

export interface PolicyFormState {
  allowedModels: string[];
  captureMode: CaptureMode;
  contentRetentionDays: string;
  deniedModels: string[];
  metadataRetentionDays: string;
  monthlyCreditBudget: string;
  noTrainingEnforced: boolean;
  requestsPerMinute: string;
}

export const EMPTY_POLICY_FORM: PolicyFormState = {
  allowedModels: [],
  captureMode: 'inherit',
  contentRetentionDays: '',
  deniedModels: [],
  metadataRetentionDays: '',
  monthlyCreditBudget: '',
  noTrainingEnforced: true,
  requestsPerMinute: '',
};

export function toPolicyFormState(
  policy: AiStudioPolicy | null | undefined
): PolicyFormState {
  if (!policy) return EMPTY_POLICY_FORM;

  return {
    allowedModels: policy.allowed_models ?? [],
    captureMode: captureModeOf(policy.capture_enabled),
    contentRetentionDays: numberField(policy.content_retention_days),
    deniedModels: policy.denied_models ?? [],
    metadataRetentionDays: numberField(policy.metadata_retention_days),
    monthlyCreditBudget: numberField(policy.monthly_credit_budget),
    noTrainingEnforced: policy.no_training_enforced ?? true,
    requestsPerMinute: numberField(policy.requests_per_minute),
  };
}

export function toPolicyPayload(
  state: PolicyFormState
): UpdateAiStudioPolicyInput {
  return {
    allowedModels: state.allowedModels,
    captureEnabled:
      state.captureMode === 'inherit' ? null : state.captureMode === 'on',
    contentRetentionDays: optionalNumber(state.contentRetentionDays),
    deniedModels: state.deniedModels,
    metadataRetentionDays: optionalNumber(state.metadataRetentionDays),
    monthlyCreditBudget: optionalNumber(state.monthlyCreditBudget),
    noTrainingEnforced: state.noTrainingEnforced,
    requestsPerMinute: optionalNumber(state.requestsPerMinute),
  };
}

/**
 * Bounds mirror the PATCH schema in
 * `app/api/v1/workspaces/[wsId]/ai/policy/route.ts` so the form rejects a value
 * before the request rather than surfacing a generic 400.
 */
export const POLICY_BOUNDS = {
  contentRetentionDays: { max: 365, min: 1 },
  metadataRetentionDays: { max: 2555, min: 30 },
  requestsPerMinute: { max: 10_000, min: 1 },
} as const;

export function findPolicyFieldError(
  state: PolicyFormState
): keyof typeof POLICY_BOUNDS | 'monthlyCreditBudget' | null {
  for (const field of [
    'contentRetentionDays',
    'metadataRetentionDays',
    'requestsPerMinute',
  ] as const) {
    const value = optionalNumber(state[field]);
    if (value === null) continue;
    const { max, min } = POLICY_BOUNDS[field];
    if (!Number.isInteger(value) || value < min || value > max) return field;
  }

  const budget = optionalNumber(state.monthlyCreditBudget);
  if (budget !== null && budget <= 0) return 'monthlyCreditBudget';

  return null;
}

export function isPolicyFormDirty(a: PolicyFormState, b: PolicyFormState) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function captureModeOf(value: boolean | null): CaptureMode {
  if (value === null || value === undefined) return 'inherit';
  return value ? 'on' : 'off';
}

function numberField(value: number | null) {
  return value === null || value === undefined ? '' : String(value);
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
