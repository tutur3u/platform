import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCustomerSession,
  getOrCreatePolarCustomer,
} from '../../utils/customer-helper';

// Mock the dependencies
vi.mock('@tuturuuu/utils/email/client', () => ({
  generateEmailSubaddressing: vi
    .fn()
    .mockImplementation((email: string, wsId: string) => `${email}+${wsId}`),
}));

vi.mock('../../utils/subscription-helper', () => ({
  convertWorkspaceIDToExternalID: vi
    .fn()
    .mockImplementation((wsId: string) => `workspace_${wsId}`),
}));

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('customer-helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore console spy to prevent test leaks
    mockConsoleLog.mockRestore();
  });

  describe('createCustomerSession', () => {
    it('should create a customer session for existing customer', async () => {
      const mockWorkspace = {
        id: 'ws-123',
        personal: true,
        creator_id: 'user-123',
        name: 'My Workspace',
        users: {
          display_name: 'John Doe',
          user_private_details: {
            email: 'john@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockCustomer = {
        id: 'cust-123',
        email: 'john@example.com',
        name: 'John Doe',
        externalId: 'user-123',
      };

      const mockSession = {
        id: 'session-123',
        customerId: 'cust-123',
        token: 'session-token',
      };

      const mockPolar = {
        customers: {
          getExternal: vi.fn().mockResolvedValue(mockCustomer),
        },
        customerSessions: {
          create: vi.fn().mockResolvedValue(mockSession),
        },
      } as unknown as Polar;

      const result = await createCustomerSession({
        polar: mockPolar,
        supabase: mockSupabase,
        wsId: 'ws-123',
      });

      expect(result).toEqual(mockSession);
      expect(mockPolar.customerSessions.create).toHaveBeenCalledWith({
        customerId: 'cust-123',
      });
    });

    it('should create a customer session for newly created customer', async () => {
      const mockWorkspace = {
        id: 'ws-456',
        personal: false,
        creator_id: 'user-456',
        name: 'Team Workspace',
        users: {
          display_name: 'Jane Smith',
          user_private_details: {
            email: 'jane@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockNewCustomer = {
        id: 'cust-456',
        email: 'jane@example.com+ws-456',
        name: 'Team Workspace',
        externalId: 'workspace_ws-456',
      };

      const mockSession = {
        id: 'session-456',
        customerId: 'cust-456',
        token: 'session-token-456',
      };

      const mockPolar = {
        customers: {
          getExternal: vi
            .fn()
            .mockRejectedValue(new Error('Customer not found')),
          create: vi.fn().mockResolvedValue(mockNewCustomer),
        },
        customerSessions: {
          create: vi.fn().mockResolvedValue(mockSession),
        },
      } as unknown as Polar;

      const result = await createCustomerSession({
        polar: mockPolar,
        supabase: mockSupabase,
        wsId: 'ws-456',
      });

      expect(result).toEqual(mockSession);
      expect(mockPolar.customerSessions.create).toHaveBeenCalledWith({
        customerId: 'cust-456',
      });
    });
  });

  describe('getOrCreatePolarCustomer', () => {
    it('should return existing customer for personal workspace', async () => {
      const mockWorkspace = {
        id: 'ws-123',
        personal: true,
        creator_id: 'user-123',
        name: 'My Workspace',
        users: {
          display_name: 'John Doe',
          user_private_details: {
            email: 'john@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockCustomer = {
        id: 'cust-123',
        email: 'john@example.com',
        name: 'John Doe',
        externalId: 'user-123',
      };

      const mockPolar = {
        customers: {
          getExternal: vi.fn().mockResolvedValue(mockCustomer),
        },
      } as unknown as Polar;

      const result = await getOrCreatePolarCustomer({
        polar: mockPolar,
        supabase: mockSupabase,
        wsId: 'ws-123',
      });

      expect(result).toEqual(mockCustomer);
      expect(mockPolar.customers.getExternal).toHaveBeenCalledWith({
        externalId: 'user-123',
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Found existing Polar customer for workspace ws-123 (personal: true)'
      );
    });

    it('should return existing customer for non-personal workspace', async () => {
      const mockWorkspace = {
        id: 'ws-456',
        personal: false,
        creator_id: 'user-456',
        name: 'Team Workspace',
        users: {
          display_name: 'Jane Smith',
          user_private_details: {
            email: 'jane@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockCustomer = {
        id: 'cust-456',
        email: 'jane@example.com+ws-456',
        name: 'Team Workspace',
        externalId: 'workspace_ws-456',
      };

      const mockPolar = {
        customers: {
          getExternal: vi.fn().mockResolvedValue(mockCustomer),
        },
      } as unknown as Polar;

      const result = await getOrCreatePolarCustomer({
        polar: mockPolar,
        supabase: mockSupabase,
        wsId: 'ws-456',
      });

      expect(result).toEqual(mockCustomer);
      expect(mockPolar.customers.getExternal).toHaveBeenCalledWith({
        externalId: 'workspace_ws-456',
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Found existing Polar customer for workspace ws-456 (personal: false)'
      );
    });

    it('should create new customer for personal workspace when not found', async () => {
      const mockWorkspace = {
        id: 'ws-789',
        personal: true,
        creator_id: 'user-789',
        name: 'New Workspace',
        users: {
          display_name: 'Alice Johnson',
          user_private_details: {
            email: 'alice@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockNewCustomer = {
        id: 'cust-789',
        email: 'alice@example.com',
        name: 'Alice Johnson',
        externalId: 'user-789',
      };

      const mockPolar = {
        customers: {
          getExternal: vi
            .fn()
            .mockRejectedValue(new Error('Customer not found')),
          create: vi.fn().mockResolvedValue(mockNewCustomer),
        },
      } as unknown as Polar;

      const result = await getOrCreatePolarCustomer({
        polar: mockPolar,
        supabase: mockSupabase,
        wsId: 'ws-789',
      });

      expect(result).toEqual(mockNewCustomer);
      expect(mockPolar.customers.create).toHaveBeenCalledWith({
        email: 'alice@example.com',
        name: 'Alice Johnson',
        externalId: 'user-789',
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'No existing Polar customer found for workspace ws-789, creating new one'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Creating Polar customer for workspace ws-789 (personal: true)'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Created new Polar customer:',
        mockNewCustomer
      );
    });

    it('should create new customer for non-personal workspace with email subaddressing', async () => {
      const mockWorkspace = {
        id: 'ws-999',
        personal: false,
        creator_id: 'user-999',
        name: 'Corporate Workspace',
        users: {
          display_name: 'Bob Wilson',
          user_private_details: {
            email: 'bob@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockNewCustomer = {
        id: 'cust-999',
        email: 'bob@example.com+ws-999',
        name: 'Corporate Workspace',
        externalId: 'workspace_ws-999',
      };

      const mockPolar = {
        customers: {
          getExternal: vi
            .fn()
            .mockRejectedValue(new Error('Customer not found')),
          create: vi.fn().mockResolvedValue(mockNewCustomer),
        },
      } as unknown as Polar;

      const result = await getOrCreatePolarCustomer({
        polar: mockPolar,
        supabase: mockSupabase,
        wsId: 'ws-999',
      });

      expect(result).toEqual(mockNewCustomer);
      expect(mockPolar.customers.create).toHaveBeenCalledWith({
        email: 'bob@example.com+ws-999',
        name: 'Corporate Workspace',
        externalId: 'workspace_ws-999',
      });
    });

    it('should throw error if workspace not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Workspace not found' },
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {} as Polar;

      await expect(
        getOrCreatePolarCustomer({
          polar: mockPolar,
          supabase: mockSupabase,
          wsId: 'ws-nonexistent',
        })
      ).rejects.toThrow('Unable to retrieve workspace information');
    });

    it('should throw error if workspace owner email not found', async () => {
      const mockWorkspace = {
        id: 'ws-no-email',
        personal: true,
        creator_id: 'user-no-email',
        name: 'No Email Workspace',
        users: {
          display_name: 'No Email User',
          user_private_details: null, // No email
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {
        customers: {
          getExternal: vi
            .fn()
            .mockRejectedValue(new Error('Customer not found')),
        },
      } as unknown as Polar;

      await expect(
        getOrCreatePolarCustomer({
          polar: mockPolar,
          supabase: mockSupabase,
          wsId: 'ws-no-email',
        })
      ).rejects.toThrow('Unable to retrieve workspace owner email');
    });

    it('should throw error if Polar customer creation fails', async () => {
      const mockWorkspace = {
        id: 'ws-fail',
        personal: true,
        creator_id: 'user-fail',
        name: 'Fail Workspace',
        users: {
          display_name: 'Fail User',
          user_private_details: {
            email: 'fail@example.com',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {
        customers: {
          getExternal: vi
            .fn()
            .mockRejectedValue(new Error('Customer not found')),
          create: vi.fn().mockResolvedValue(null), // Returns null (failure)
        },
      } as unknown as Polar;

      await expect(
        getOrCreatePolarCustomer({
          polar: mockPolar,
          supabase: mockSupabase,
          wsId: 'ws-fail',
        })
      ).rejects.toThrow('Failed to create new customer in Polar');
    });

    it('should handle workspace with missing users join data', async () => {
      const mockWorkspace = {
        id: 'ws-no-users',
        personal: true,
        creator_id: 'user-no-users',
        name: 'No Users Data',
        users: null, // Missing join data
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockWorkspace,
          error: null,
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as TypedSupabaseClient;

      const mockPolar = {
        customers: {
          getExternal: vi
            .fn()
            .mockRejectedValue(new Error('Customer not found')),
        },
      } as unknown as Polar;

      await expect(
        getOrCreatePolarCustomer({
          polar: mockPolar,
          supabase: mockSupabase,
          wsId: 'ws-no-users',
        })
      ).rejects.toThrow('Unable to retrieve workspace owner email');
    });
  });
});
