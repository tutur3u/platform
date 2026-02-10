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
    it('should return false when workspace does not exist', async () => {
      const mockPolar = {} as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: false, hasActive: false });
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Workspace ws-123 not found, cannot check active subscriptions'
      );
      expect(mockSupabase.from).toHaveBeenCalledWith('workspaces');
    });

    it('should return true when workspace has active subscriptions', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: {
              items: [
                { id: 'sub-1', status: 'active' },
                { id: 'sub-2', status: 'canceled' },
              ],
            },
          }),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: true, hasActive: true });
      expect(mockPolar.subscriptions.list).toHaveBeenCalledWith({
        metadata: { wsId: 'ws-123' },
        sorting: 'status',
      });
    });

    it('should return false when workspace has no active subscriptions', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: {
              items: [
                { id: 'sub-1', status: 'canceled' },
                { id: 'sub-2', status: 'revoked' },
              ],
            },
          }),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: true, hasActive: false });
    });

    it('should return false when items is empty', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: {
              items: [],
            },
          }),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: true, hasActive: false });
    });

    it('should return false when items is null/undefined', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: {
              items: null,
            },
          }),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: true, hasActive: false });
    });

    it('should return false on error', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockRejectedValue(new Error('Polar API error')),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: true, hasActive: false });
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error checking active subscriptions:',
        'Polar API error'
      );
    });

    it('should handle non-Error exceptions', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockRejectedValue('String error'),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await hasActiveSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({ hasWorkspace: true, hasActive: false });
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error checking active subscriptions:',
        'String error'
      );
    });
  });

  describe('createFreeSubscription', () => {
    it('should return null if workspace already has active subscription', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: {
              items: [{ id: 'sub-1', status: 'active' }],
            },
          }),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

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
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: { items: [] },
          }),
        },
      } as unknown as Polar;

      const mockWorkspaceChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockWorkspaceChain),
      } as unknown as TypedSupabaseClient;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toBeNull();
      // The error is logged by hasActiveSubscription when workspace doesn't exist
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Workspace ws-123 not found, cannot check active subscriptions'
      );
    });

    it('should return null if no free product found', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: { items: [] },
          }),
        },
      } as unknown as Polar;

      let callCount = 0;
      const mockWorkspaceChain1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockWorkspaceChain2 = {
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
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return mockWorkspaceChain1; // hasActiveSubscription check
          if (callCount === 2) return mockWorkspaceChain2; // createFreeSubscription workspace fetch
          return mockProductChain; // product fetch
        }),
      } as unknown as TypedSupabaseClient;

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
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: { items: [] },
          }),
          create: vi.fn().mockResolvedValue({
            id: 'sub-123',
            productId: 'prod-free-123',
            status: 'active',
          }),
        },
      } as unknown as Polar;

      let callCount = 0;
      const mockWorkspaceChain1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockWorkspaceChain2 = {
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
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return mockWorkspaceChain1; // hasActiveSubscription check
          if (callCount === 2) return mockWorkspaceChain2; // createFreeSubscription workspace fetch
          return mockProductChain; // product fetch
        }),
      } as unknown as TypedSupabaseClient;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({
        id: 'sub-123',
        productId: 'prod-free-123',
        status: 'active',
      });
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
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: { items: [] },
          }),
          create: vi.fn().mockResolvedValue({
            id: 'sub-456',
            productId: 'prod-free-456',
            status: 'active',
          }),
        },
      } as unknown as Polar;

      let callCount = 0;
      const mockWorkspaceChain1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockWorkspaceChain2 = {
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
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return mockWorkspaceChain1; // hasActiveSubscription check
          if (callCount === 2) return mockWorkspaceChain2; // createFreeSubscription workspace fetch
          return mockProductChain; // product fetch
        }),
      } as unknown as TypedSupabaseClient;

      const result = await createFreeSubscription(
        mockPolar,
        mockSupabase,
        'ws-123'
      );

      expect(result).toEqual({
        id: 'sub-456',
        productId: 'prod-free-456',
        status: 'active',
      });
      expect(mockPolar.subscriptions.create).toHaveBeenCalledWith({
        productId: 'prod-free-456',
        externalCustomerId: 'workspace_ws-123',
        metadata: { wsId: 'ws-123' },
      });
    });

    it('should return null if Polar API call fails', async () => {
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: { items: [] },
          }),
          create: vi.fn().mockRejectedValue(new Error('Polar API error')),
        },
      } as unknown as Polar;

      let callCount = 0;
      const mockWorkspaceChain1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockWorkspaceChain2 = {
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
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return mockWorkspaceChain1; // hasActiveSubscription check
          if (callCount === 2) return mockWorkspaceChain2; // createFreeSubscription workspace fetch
          return mockProductChain; // product fetch
        }),
      } as unknown as TypedSupabaseClient;

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
      const mockPolar = {
        subscriptions: {
          list: vi.fn().mockResolvedValue({
            result: { items: [] },
          }),
          create: vi.fn().mockRejectedValue('String error'),
        },
      } as unknown as Polar;

      let callCount = 0;
      const mockWorkspaceChain1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'ws-123' },
        }),
      };

      const mockWorkspaceChain2 = {
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
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return mockWorkspaceChain1; // hasActiveSubscription check
          if (callCount === 2) return mockWorkspaceChain2; // createFreeSubscription workspace fetch
          return mockProductChain; // product fetch
        }),
      } as unknown as TypedSupabaseClient;

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
