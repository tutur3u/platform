/**
 * Tests for API Key Management Utilities
 *
 * Tests the integration of role-based and default permissions
 * for workspace API keys.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateApiKey,
  hasAllPermissions,
  hasAnyPermission,
  hashApiKey,
  hasPermission,
  validateApiKey,
  validateApiKeyHash,
  type WorkspaceContext,
} from './api-keys';

// Mock the Supabase admin client
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@tuturuuu/supabase/next/server';

describe('API Key Generation', () => {
  it('should generate API key with correct prefix', () => {
    const { key, prefix } = generateApiKey();

    expect(key).toMatch(/^ttr_[a-f0-9]{64}$/);
    expect(prefix).toMatch(/^ttr_[a-f0-9]{8}$/);
    expect(key.startsWith(prefix)).toBe(true);
  });

  it('should generate unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1.key).not.toBe(key2.key);
    expect(key1.prefix).not.toBe(key2.prefix);
  });
});

describe('API Key Hashing', () => {
  it('should hash and validate API key correctly', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);

    expect(hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);

    const isValid = await validateApiKeyHash(key, hash);
    expect(isValid).toBe(true);
  });

  it('should reject invalid API key', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);

    const wrongKey = `ttr_${'0'.repeat(64)}`;
    const isValid = await validateApiKeyHash(wrongKey, hash);

    expect(isValid).toBe(false);
  });

  it('should handle malformed hash gracefully', async () => {
    const { key } = generateApiKey();

    const isValid1 = await validateApiKeyHash(key, 'invalid');
    expect(isValid1).toBe(false);

    const isValid2 = await validateApiKeyHash(key, 'salt:invalidhash');
    expect(isValid2).toBe(false);
  });
});

describe('API Key Validation with Permissions', () => {
  const mockSupabase = {
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminClient).mockResolvedValue(mockSupabase as never);
  });

  it('should return null for invalid key format', async () => {
    const result = await validateApiKey('invalid_key');
    expect(result).toBeNull();
  });

  it('should return null when key not found', async () => {
    const { key } = generateApiKey();

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const result = await validateApiKey(key);
    expect(result).toBeNull();
  });

  it('should return null for expired key', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);

    const expiredKey = {
      id: 'key-123',
      ws_id: 'ws-123',
      key_hash: hash,
      role_id: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [expiredKey],
            error: null,
          }),
        }),
      }),
    });

    const result = await validateApiKey(key);
    expect(result).toBeNull();
  });

  it('should merge role and default permissions', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);

    const keyRecord = {
      id: 'key-123',
      ws_id: 'ws-123',
      key_hash: hash,
      role_id: 'role-123',
      expires_at: null,
    };

    // Mock the API key lookup
    const mockApiKeyQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [keyRecord],
            error: null,
          }),
        }),
      }),
    };

    // Mock role permissions query
    const mockRolePermissionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    mockRolePermissionsQuery.eq = vi.fn().mockImplementation((field) => {
      if (field === 'enabled') {
        return Promise.resolve({
          data: [
            { permission: 'manage_workspace_settings' },
            { permission: 'ai_chat' },
          ],
          error: null,
        });
      }
      return mockRolePermissionsQuery;
    });

    // Mock default permissions query
    const mockDefaultPermissionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    mockDefaultPermissionsQuery.eq = vi.fn().mockImplementation((field) => {
      if (field === 'enabled') {
        return Promise.resolve({
          data: [
            { permission: 'manage_workspace_members' },
            { permission: 'ai_chat' },
          ], // ai_chat is duplicate
          error: null,
        });
      }
      return mockDefaultPermissionsQuery;
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockApiKeyQuery; // First call: workspace_api_keys
      if (callCount === 2) return mockRolePermissionsQuery; // Second call: workspace_role_permissions
      if (callCount === 3) return mockDefaultPermissionsQuery; // Third call: workspace_default_permissions
      return mockApiKeyQuery;
    });

    const result = await validateApiKey(key);

    expect(result).not.toBeNull();
    expect(result?.wsId).toBe('ws-123');
    expect(result?.keyId).toBe('key-123');
    expect(result?.roleId).toBe('role-123');
    expect(result?.permissions).toHaveLength(3); // Should have 3 unique permissions
    expect(result?.permissions).toContain('manage_workspace_settings');
    expect(result?.permissions).toContain('manage_workspace_members');
    expect(result?.permissions).toContain('ai_chat');
  });

  it('should use only default permissions when no role assigned', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);

    const keyRecord = {
      id: 'key-456',
      ws_id: 'ws-456',
      key_hash: hash,
      role_id: null, // No role assigned
      expires_at: null,
    };

    // Mock the API key lookup
    const mockApiKeyQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [keyRecord],
            error: null,
          }),
        }),
      }),
    };

    // Mock default permissions query
    const mockDefaultPermissionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    mockDefaultPermissionsQuery.eq = vi.fn().mockImplementation((field) => {
      if (field === 'enabled') {
        return Promise.resolve({
          data: [
            { permission: 'manage_workspace_settings' },
            { permission: 'manage_workspace_members' },
          ],
          error: null,
        });
      }
      return mockDefaultPermissionsQuery;
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockApiKeyQuery; // First call: workspace_api_keys
      if (callCount === 2) return mockDefaultPermissionsQuery; // Second call: workspace_default_permissions (no role, so skip role query)
      return mockApiKeyQuery;
    });

    const result = await validateApiKey(key);

    expect(result).not.toBeNull();
    expect(result?.wsId).toBe('ws-456');
    expect(result?.keyId).toBe('key-456');
    expect(result?.roleId).toBeNull();
    expect(result?.permissions).toHaveLength(2);
    expect(result?.permissions).toContain('manage_workspace_settings');
    expect(result?.permissions).toContain('manage_workspace_members');
  });

  it('should return empty permissions when no role and no defaults', async () => {
    const { key } = generateApiKey();
    const hash = await hashApiKey(key);

    const keyRecord = {
      id: 'key-789',
      ws_id: 'ws-789',
      key_hash: hash,
      role_id: null,
      expires_at: null,
    };

    // Mock the API key lookup
    const mockApiKeyQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({
            data: [keyRecord],
            error: null,
          }),
        }),
      }),
    };

    // Mock default permissions query returning empty
    const mockDefaultPermissionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    mockDefaultPermissionsQuery.eq = vi.fn().mockImplementation((field) => {
      if (field === 'enabled') {
        return Promise.resolve({
          data: [],
          error: null,
        });
      }
      return mockDefaultPermissionsQuery;
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockApiKeyQuery;
      if (callCount === 2) return mockDefaultPermissionsQuery;
      return mockApiKeyQuery;
    });

    const result = await validateApiKey(key);

    expect(result).not.toBeNull();
    expect(result?.permissions).toHaveLength(0);
  });
});

describe('Permission Helpers', () => {
  const mockContext: WorkspaceContext = {
    wsId: 'ws-123',
    keyId: 'key-123',
    roleId: 'role-123',
    permissions: [
      'manage_workspace_settings',
      'ai_chat',
      'manage_workspace_members',
    ],
  };

  describe('hasPermission', () => {
    it('should return true for existing permission', () => {
      expect(hasPermission(mockContext, 'ai_chat')).toBe(true);
    });

    it('should return false for non-existing permission', () => {
      expect(hasPermission(mockContext, 'manage_finance' as never)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if any permission exists', () => {
      expect(
        hasAnyPermission(mockContext, ['manage_finance' as never, 'ai_chat'])
      ).toBe(true);
    });

    it('should return false if no permissions exist', () => {
      expect(
        hasAnyPermission(mockContext, [
          'manage_finance' as never,
          'delete_workspace' as never,
        ])
      ).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if all permissions exist', () => {
      expect(
        hasAllPermissions(mockContext, ['manage_workspace_settings', 'ai_chat'])
      ).toBe(true);
    });

    it('should return false if some permissions missing', () => {
      expect(
        hasAllPermissions(mockContext, [
          'manage_workspace_settings',
          'manage_finance' as never,
        ])
      ).toBe(false);
    });
  });
});
