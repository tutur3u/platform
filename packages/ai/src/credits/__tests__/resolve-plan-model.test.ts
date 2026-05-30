import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceTier: vi.fn(),
}));

import {
  PlanModelResolutionError,
  selectEffectivePlanModel,
} from '../resolve-plan-model';

const baseAllocation = {
  id: 'alloc-1',
  tier: 'PRO' as const,
  allowed_models: ['google/gemini-2.5-flash', 'google/imagen-4.0-generate-001'],
  default_language_model: 'google/gemini-2.5-flash',
  default_image_model: 'google/imagen-4.0-generate-001',
};

describe('selectEffectivePlanModel', () => {
  it('preserves an allowed requested model', () => {
    const result = selectEffectivePlanModel({
      allocation: baseAllocation,
      capability: 'language',
      modelsById: new Map([
        [
          'google/gemini-2.5-flash',
          { id: 'google/gemini-2.5-flash', is_enabled: true, type: 'language' },
        ],
        [
          'google/imagen-4.0-generate-001',
          {
            id: 'google/imagen-4.0-generate-001',
            is_enabled: true,
            type: 'image',
          },
        ],
      ]),
      requestedModel: 'google/gemini-2.5-flash',
    });

    expect(result.modelId).toBe('google/gemini-2.5-flash');
    expect(result.source).toBe('requested');
  });

  it('falls back to the plan default when the requested model is disallowed', () => {
    const result = selectEffectivePlanModel({
      allocation: baseAllocation,
      capability: 'language',
      modelsById: new Map([
        [
          'google/gemini-2.5-flash',
          { id: 'google/gemini-2.5-flash', is_enabled: true, type: 'language' },
        ],
        [
          'google/gemini-2.5-pro',
          { id: 'google/gemini-2.5-pro', is_enabled: true, type: 'language' },
        ],
        [
          'google/imagen-4.0-generate-001',
          {
            id: 'google/imagen-4.0-generate-001',
            is_enabled: true,
            type: 'image',
          },
        ],
      ]),
      requestedModel: 'google/gemini-2.5-pro',
    });

    expect(result.modelId).toBe('google/gemini-2.5-flash');
    expect(result.source).toBe('plan_default');
  });

  it('normalizes legacy Gemini 3.1 Flash Lite preview allocation values', () => {
    const result = selectEffectivePlanModel({
      allocation: {
        ...baseAllocation,
        allowed_models: ['google/gemini-3.1-flash-lite-preview'],
        default_language_model: 'google/gemini-3.1-flash-lite-preview',
      },
      capability: 'language',
      modelsById: new Map([
        [
          'google/gemini-3.1-flash-lite',
          {
            id: 'google/gemini-3.1-flash-lite',
            is_enabled: true,
            type: 'language',
          },
        ],
      ]),
      requestedModel: 'google/gemini-3.1-flash-lite-preview',
    });

    expect(result.modelId).toBe('google/gemini-3.1-flash-lite');
    expect(result.source).toBe('requested');
  });

  it('normalizes invalid Gemini 3 Flash allocation values', () => {
    const result = selectEffectivePlanModel({
      allocation: {
        ...baseAllocation,
        allowed_models: ['google/gemini-3-flash'],
        default_language_model: 'google/gemini-3-flash',
      },
      capability: 'language',
      modelsById: new Map([
        [
          'google/gemini-3.1-flash-lite',
          {
            id: 'google/gemini-3.1-flash-lite',
            is_enabled: true,
            type: 'language',
          },
        ],
      ]),
      requestedModel: 'google/gemini-3-flash',
    });

    expect(result.modelId).toBe('google/gemini-3.1-flash-lite');
    expect(result.source).toBe('requested');
  });

  it('falls back to the image default for invalid requested image model', () => {
    const result = selectEffectivePlanModel({
      allocation: baseAllocation,
      capability: 'image',
      modelsById: new Map([
        [
          'google/gemini-2.5-flash',
          { id: 'google/gemini-2.5-flash', is_enabled: true, type: 'language' },
        ],
        [
          'google/imagen-4.0-fast-generate-001',
          {
            id: 'google/imagen-4.0-fast-generate-001',
            is_enabled: true,
            type: 'image',
          },
        ],
        [
          'google/imagen-4.0-generate-001',
          {
            id: 'google/imagen-4.0-generate-001',
            is_enabled: true,
            type: 'image',
          },
        ],
      ]),
      requestedModel: 'google/imagen-4.0-fast-generate-001',
    });

    expect(result.modelId).toBe('google/imagen-4.0-generate-001');
    expect(result.source).toBe('plan_default');
  });

  it('throws when the default model is disabled', () => {
    expect(() =>
      selectEffectivePlanModel({
        allocation: baseAllocation,
        capability: 'language',
        modelsById: new Map([
          [
            'google/gemini-2.5-flash',
            {
              id: 'google/gemini-2.5-flash',
              is_enabled: false,
              type: 'language',
            },
          ],
          [
            'google/imagen-4.0-generate-001',
            {
              id: 'google/imagen-4.0-generate-001',
              is_enabled: true,
              type: 'image',
            },
          ],
        ]),
      })
    ).toThrowError(PlanModelResolutionError);
  });

  it('uses the API fallback language default when the allocation default is unset', () => {
    const result = selectEffectivePlanModel({
      allocation: {
        ...baseAllocation,
        allowed_models: ['google/gemini-3.1-flash-lite'],
        default_language_model: null,
      },
      capability: 'language',
      modelsById: new Map([
        [
          'google/gemini-3.1-flash-lite',
          {
            id: 'google/gemini-3.1-flash-lite',
            is_enabled: true,
            type: 'language',
          },
        ],
        [
          'google/imagen-4.0-generate-001',
          {
            id: 'google/imagen-4.0-generate-001',
            is_enabled: true,
            type: 'image',
          },
        ],
      ]),
    });

    expect(result.modelId).toBe('google/gemini-3.1-flash-lite');
    expect(result.source).toBe('plan_default');
  });
});
