import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  convertExternalIDToWorkspaceID,
  convertWorkspaceIDToExternalID,
  createFreeSubscription,
  hasActiveSubscription,
} from '../../utils/subscription-helper';

// Mock console methods
const mockConsoleError = vi
  .spyOn(console, 'error')
  .mockImplementation(() => {});
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('subscription-helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasActiveSubscription', () => {
    it('should return true when workspace has active subscriptions', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      // The second .eq() call resolves with the result
      mockChain.eq.mockReturnValueOnce(mockChain).mockResolvedValueOnce({
        count: 2,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(mockSupabase, 'ws-123');

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('workspace_subscriptions');
      expect(mockChain.select).toHaveBeenCalledWith('*', {
        count: 'exact',
        head: true,
      });
    });

    it('should return false when workspace has no active subscriptions', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockChain.eq.mockReturnValueOnce(mockChain).mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(mockSupabase, 'ws-123');

      expect(result).toBe(false);
    });

    it('should return false when count is null', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockChain.eq.mockReturnValueOnce(mockChain).mockResolvedValueOnce({
        count: null,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(mockSupabase, 'ws-123');

      expect(result).toBe(false);
    });

    it('should return true on error to avoid duplicate free subscriptions', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockChain.eq.mockReturnValueOnce(mockChain).mockResolvedValueOnce({
        count: null,
        error: { message: 'Database error' },
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(mockSupabase, 'ws-123');

      expect(result).toBe(true);
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error checking active subscriptions:',
        'Database error'
      );
    });
  });

  describe('createFreeSubscription', () => {
    it('should return null if workspace already has active subscription', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockChain.eq.mockReturnValueOnce(mockChain).mockResolvedValueOnce({
        count: 1,
        error: null,
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {} as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toBeNull();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Workspace ws-123 already has an active subscription, skipping free subscription creation'
      );
    });

    it('should return null if workspace not found', async () => {
      const mockSubscriptionChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockSubscriptionChain.eq
        .mockReturnValueOnce(mockSubscriptionChain)
        .mockResolvedValueOnce({
          count: 0,
          error: null,
        });

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
        }),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(mockSubscriptionChain)
          .mockReturnValueOnce(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {} as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toBeNull();
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Workspace not found for wsId ws-123, cannot create free subscription'
      );
    });

    it('should return null if no free product found', async () => {
      const mockSubscriptionChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockSubscriptionChain.eq
        .mockReturnValueOnce(mockSubscriptionChain)
        .mockResolvedValueOnce({
          count: 0,
          error: null,
        });

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123', personal: false, creator_id: 'user-123' },
        }),
      };

      const mockProductChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'No free product' },
        }),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(mockSubscriptionChain)
          .mockReturnValueOnce(mockWorkspaceChain)
          .mockReturnValueOnce(mockProductChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {} as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toBeNull();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('No FREE tier product found'),
        { message: 'No free product' }
      );
    });

    it('should create free subscription for personal workspace', async () => {
      const mockSubscriptionChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockSubscriptionChain.eq
        .mockReturnValueOnce(mockSubscriptionChain)
        .mockResolvedValueOnce({
          count: 0,
          error: null,
        });

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123', personal: true, creator_id: 'user-123' },
        }),
      };

      const mockProductChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'prod-free-123', pricing_model: 'free', archived: false },
        }),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(mockSubscriptionChain)
          .mockReturnValueOnce(mockWorkspaceChain)
          .mockReturnValueOnce(mockProductChain),
      } as unknown as TypedSupabaseClient;

      const mockSubscription = {
        id: 'sub-123',
        productId: 'prod-free-123',
        status: 'active',
      };

      const mockPolar = {
        subscriptions: {
          create: vi.fn().mockResolvedValue(mockSubscription),
        },
      } as unknown as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual(mockSubscription);
      expect(mockPolar.subscriptions.create).toHaveBeenCalledWith({
        productId: 'prod-free-123',
        externalCustomerId: 'user-123',
        metadata: { wsId: 'ws-123' },
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Created free subscription sub-123 for workspace ws-123'
      );
    });

    it('should create free subscription for non-personal workspace', async () => {
      const mockSubscriptionChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockSubscriptionChain.eq
        .mockReturnValueOnce(mockSubscriptionChain)
        .mockResolvedValueOnce({
          count: 0,
          error: null,
        });

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123', personal: false, creator_id: 'user-123' },
        }),
      };

      const mockProductChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'prod-free-456', pricing_model: 'free', archived: false },
        }),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(mockSubscriptionChain)
          .mockReturnValueOnce(mockWorkspaceChain)
          .mockReturnValueOnce(mockProductChain),
      } as unknown as TypedSupabaseClient;

      const mockSubscription = {
        id: 'sub-456',
        productId: 'prod-free-456',
        status: 'active',
      };

      const mockPolar = {
        subscriptions: {
          create: vi.fn().mockResolvedValue(mockSubscription),
        },
      } as unknown as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual(mockSubscription);
      expect(mockPolar.subscriptions.create).toHaveBeenCalledWith({
        productId: 'prod-free-456',
        externalCustomerId: 'workspace_ws-123',
        metadata: { wsId: 'ws-123' },
      });
    });

    it('should return null if Polar API call fails', async () => {
      const mockSubscriptionChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockSubscriptionChain.eq
        .mockReturnValueOnce(mockSubscriptionChain)
        .mockResolvedValueOnce({
          count: 0,
          error: null,
        });

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123', personal: false, creator_id: 'user-123' },
        }),
      };

      const mockProductChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'prod-free-456', pricing_model: 'free', archived: false },
        }),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(mockSubscriptionChain)
          .mockReturnValueOnce(mockWorkspaceChain)
          .mockReturnValueOnce(mockProductChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {
        subscriptions: {
          create: vi.fn().mockRejectedValue(new Error('Polar API error')),
        },
      } as unknown as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toBeNull();
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Failed to create free subscription for workspace ws-123:',
        'Polar API error'
      );
    });

    it('should handle non-Error exceptions from Polar API', async () => {
      const mockSubscriptionChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };

      mockSubscriptionChain.eq
        .mockReturnValueOnce(mockSubscriptionChain)
        .mockResolvedValueOnce({
          count: 0,
          error: null,
        });

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123', personal: false, creator_id: 'user-123' },
        }),
      };

      const mockProductChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'prod-free-456', pricing_model: 'free', archived: false },
        }),
      };

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(mockSubscriptionChain)
          .mockReturnValueOnce(mockWorkspaceChain)
          .mockReturnValueOnce(mockProductChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {
        subscriptions: {
          create: vi.fn().mockRejectedValue('String error'),
        },
      } as unknown as Polar;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toBeNull();
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Failed to create free subscription for workspace ws-123:',
        'String error'
      );
    });
  });

  describe('convertWorkspaceIDToExternalID', () => {
    it('should convert workspace ID to external ID format', () => {
      expect(convertWorkspaceIDToExternalID('ws-123')).toBe('workspace_ws-123');
      expect(convertWorkspaceIDToExternalID('abc-def-ghi')).toBe(
        'workspace_abc-def-ghi'
      );
    });

    it('should handle empty string', () => {
      expect(convertWorkspaceIDToExternalID('')).toBe('workspace_');
    });
  });

  describe('convertExternalIDToWorkspaceID', () => {
    it('should extract workspace ID from external ID format', () => {
      expect(convertExternalIDToWorkspaceID('workspace_ws-123')).toBe('ws-123');
      expect(convertExternalIDToWorkspaceID('workspace_abc-def-ghi')).toBe(
        'abc-def-ghi'
      );
    });

    it('should return null for non-workspace external IDs', () => {
      expect(convertExternalIDToWorkspaceID('user-123')).toBeNull();
      expect(convertExternalIDToWorkspaceID('random-id')).toBeNull();
      expect(convertExternalIDToWorkspaceID('')).toBeNull();
    });

    it('should handle edge case of workspace_ with nothing after', () => {
      expect(convertExternalIDToWorkspaceID('workspace_')).toBe('');
    });
  });
});
