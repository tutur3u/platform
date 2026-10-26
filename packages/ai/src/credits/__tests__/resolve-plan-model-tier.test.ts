import { beforeEach, describe, expect, it, vi } from 'vitest';

// Uses the real admin tier lookup so a non-canonical workspace UUID cannot
// silently resolve a paid workspace against the FREE allocation.
const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: vi.fn(),
}));

import { resolvePlanModel } from '../resolve-plan-model';

const canonical = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const model = 'google/gemini-2.5-flash';

function adminClient() {
  const allocationTiers: string[] = [];
  const allocations = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(function (this: unknown, column: string, value: string) {
      if (column === 'tier') allocationTiers.push(value);
      return allocations;
    }),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: `alloc-${allocationTiers.at(-1)}`,
        tier: allocationTiers.at(-1),
        allowed_models: [model],
        default_language_model: model,
        default_image_model: null,
      },
      error: null,
    })),
  };
  const subscriptions = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: [
        {
          ws_id: canonical,
          created_at: '2026-10-01T00:00:00.000Z',
          product_id: 'product-pro',
          status: 'active',
        },
      ],
      error: null,
    }),
  };
  const products = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: [{ id: 'product-pro', tier: 'PRO' }],
      error: null,
    }),
  };
  const gatewayModels = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: [{ id: model, type: 'language', is_enabled: true }],
      error: null,
    }),
  };
  return {
    allocationTiers,
    client: {
      from: vi.fn((table: string) =>
        table === 'workspace_subscriptions' ? subscriptions : allocations
      ),
      schema: vi.fn(() => ({
        from: vi.fn((table: string) =>
          table === 'workspace_subscription_products' ? products : gatewayModels
        ),
      })),
    },
  };
}

describe('resolvePlanModel workspace tier', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([canonical, canonical.toUpperCase()])(
    'uses the PRO allocation for workspace %s',
    async (wsId) => {
      const admin = adminClient();
      mockCreateAdminClient.mockResolvedValue(admin.client);

      const result = await resolvePlanModel({ capability: 'language', wsId });

      expect(admin.allocationTiers).toEqual(['PRO']);
      expect(result.tier).toBe('PRO');
      expect(result.modelId).toBe(model);
    }
  );
});
