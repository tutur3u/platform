import type { AiStudioPolicy } from '@tuturuuu/internal-api/ai-studio';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_POLICY_FORM,
  findPolicyFieldError,
  isPolicyFormDirty,
  toPolicyFormState,
  toPolicyPayload,
} from './policy-form-state';

const policy: AiStudioPolicy = {
  allowed_models: ['google/gemini-2.5-flash'],
  api_key_creation_approved: true,
  capture_enabled: false,
  content_retention_days: 14,
  denied_models: [],
  metadata_retention_days: null,
  monthly_credit_budget: 25.5,
  no_training_enforced: true,
  requests_per_minute: 120,
  updated_at: '2026-07-30T00:00:00.000Z',
};

describe('AI Studio policy form state', () => {
  it('maps a stored policy into editable fields', () => {
    expect(toPolicyFormState(policy)).toEqual({
      allowedModels: ['google/gemini-2.5-flash'],
      captureMode: 'off',
      contentRetentionDays: '14',
      deniedModels: [],
      metadataRetentionDays: '',
      monthlyCreditBudget: '25.5',
      noTrainingEnforced: true,
      requestsPerMinute: '120',
    });
  });

  it('treats an absent policy and a null capture flag as inherited', () => {
    expect(toPolicyFormState(null)).toEqual(EMPTY_POLICY_FORM);
    expect(
      toPolicyFormState({ ...policy, capture_enabled: null }).captureMode
    ).toBe('inherit');
  });

  it('sends null rather than zero for cleared optional limits', () => {
    const payload = toPolicyPayload({
      ...EMPTY_POLICY_FORM,
      captureMode: 'on',
    });

    expect(payload.captureEnabled).toBe(true);
    expect(payload.contentRetentionDays).toBeNull();
    expect(payload.metadataRetentionDays).toBeNull();
    expect(payload.monthlyCreditBudget).toBeNull();
    expect(payload.requestsPerMinute).toBeNull();
  });

  it('round-trips a stored policy without changing it', () => {
    const payload = toPolicyPayload(toPolicyFormState(policy));

    expect(payload).toEqual({
      allowedModels: ['google/gemini-2.5-flash'],
      captureEnabled: false,
      contentRetentionDays: 14,
      deniedModels: [],
      metadataRetentionDays: null,
      monthlyCreditBudget: 25.5,
      noTrainingEnforced: true,
      requestsPerMinute: 120,
    });
  });

  it('rejects values the PATCH schema would reject', () => {
    expect(findPolicyFieldError(EMPTY_POLICY_FORM)).toBeNull();
    expect(
      findPolicyFieldError({ ...EMPTY_POLICY_FORM, requestsPerMinute: '0' })
    ).toBe('requestsPerMinute');
    expect(
      findPolicyFieldError({ ...EMPTY_POLICY_FORM, requestsPerMinute: '20000' })
    ).toBe('requestsPerMinute');
    expect(
      findPolicyFieldError({
        ...EMPTY_POLICY_FORM,
        contentRetentionDays: '400',
      })
    ).toBe('contentRetentionDays');
    expect(
      findPolicyFieldError({
        ...EMPTY_POLICY_FORM,
        metadataRetentionDays: '29',
      })
    ).toBe('metadataRetentionDays');
    expect(
      findPolicyFieldError({ ...EMPTY_POLICY_FORM, monthlyCreditBudget: '0' })
    ).toBe('monthlyCreditBudget');
    expect(
      findPolicyFieldError({
        ...EMPTY_POLICY_FORM,
        contentRetentionDays: '1.5',
      })
    ).toBe('contentRetentionDays');
  });

  it('detects unsaved edits', () => {
    const baseline = toPolicyFormState(policy);

    expect(isPolicyFormDirty(baseline, baseline)).toBe(false);
    expect(
      isPolicyFormDirty(baseline, { ...baseline, captureMode: 'on' })
    ).toBe(true);
  });
});
