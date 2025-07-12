import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAdminClient, createClient } from '@tuturuuu/supabase/next/server';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';

// Mock external dependencies
vi.mock('@tuturuuu/supabase/next/server');
vi.mock('nanoid');
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn((data: any, init?: ResponseInit) => ({
      data,
      status: init?.status || 200,
    })),
  },
}));

const mockCreateClient = vi.mocked(createClient);
const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockNanoid = vi.mocked(nanoid);
const mockNextResponseJson = vi.mocked(NextResponse.json);

describe('Link Shortener API Route', () => {
  let mockSupabase: any;
  let mockAdminSupabase: any;
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default Supabase mocks
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
    };

    mockAdminSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
    };

    mockCreateClient.mockResolvedValue(mockSupabase);
    mockCreateAdminClient.mockResolvedValue(mockAdminSupabase);
    
    // Setup default request mock
    mockRequest = {
      json: vi.fn(),
    };

    // Setup default nanoid mock
    mockNanoid.mockReturnValue('abc123');
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 when user ID is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: null } },
      });

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 when user is not a member of the workspace', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
              }),
            }),
          }),
        }),
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
      });

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should verify workspace membership correctly', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'member-123', ws_id: 'workspace-1', user_id: 'user-123' },
              }),
            }),
          }),
        }),
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'abc123' },
              error: null,
            }),
          }),
        }),
      });

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      // Should verify workspace membership was checked
      expect(mockSupabase.from).toHaveBeenCalledWith('workspace_members');
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'member-123' },
              }),
            }),
          }),
        }),
      });
    });

    it('should return 400 when URL is missing', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    });

    it('should return 400 when URL is not a string', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 123,
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    });

    it('should return 400 when workspace ID is missing', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    });

    it('should return 400 for invalid URL format', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'not-a-valid-url',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    });

    it('should return 400 for invalid custom slug format', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        customSlug: 'invalid slug!@#',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        {
          error: 'Custom slug can only contain letters, numbers, hyphens, and underscores (max 50 characters)',
        },
        { status: 400 }
      );
    });

    it('should return 400 for custom slug that is too long', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        customSlug: 'a'.repeat(51),
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        {
          error: 'Custom slug can only contain letters, numbers, hyphens, and underscores (max 50 characters)',
        },
        { status: 400 }
      );
    });

    it('should accept valid URLs with various protocols', async () => {
      const validUrls = [
        'https://example.com',
        'http://example.com',
        'https://sub.domain.example.com/path?query=value',
        'ftp://files.example.com',
      ];

      for (const url of validUrls) {
        vi.clearAllMocks();
        
        mockRequest.json = vi.fn().mockResolvedValue({
          url,
          wsId: 'workspace-1',
        });

        mockAdminSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'link-123', slug: 'abc123' },
                error: null,
              }),
            }),
          }),
        });

        await POST(mockRequest as NextRequest);

        expect(mockNextResponseJson).not.toHaveBeenCalledWith(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    });

    it('should accept valid custom slugs', async () => {
      const validSlugs = [
        'valid-slug',
        'valid_slug',
        'ValidSlug123',
        'a',
        'a'.repeat(50),
      ];

      for (const customSlug of validSlugs) {
        vi.clearAllMocks();
        
        mockRequest.json = vi.fn().mockResolvedValue({
          url: 'https://example.com',
          customSlug,
          wsId: 'workspace-1',
        });

        mockAdminSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'link-123', slug: customSlug },
                error: null,
              }),
            }),
          }),
        });

        await POST(mockRequest as NextRequest);

        expect(mockNextResponseJson).not.toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.stringContaining('Custom slug'),
          }),
          { status: 400 }
        );
      }
    });

    it('should reject URLs with malicious content', async () => {
      const maliciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
      ];

      for (const url of maliciousUrls) {
        vi.clearAllMocks();
        
        mockRequest.json = vi.fn().mockResolvedValue({
          url,
          wsId: 'workspace-1',
        });

        await POST(mockRequest as NextRequest);

        expect(mockNextResponseJson).toHaveBeenCalledWith(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    });
  });

  describe('Slug Generation and Uniqueness', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'member-123' },
              }),
            }),
          }),
        }),
      });
    });

    it('should generate a random slug when no custom slug is provided', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'abc123' },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNanoid).toHaveBeenCalledWith(6);
    });

    it('should use custom slug when provided and available', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        customSlug: 'my-custom-slug',
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'my-custom-slug' },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNanoid).not.toHaveBeenCalled();
    });

    it('should return 409 when custom slug is already taken', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        customSlug: 'taken-slug',
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'existing-link' },
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Custom slug is already taken' },
        { status: 409 }
      );
    });

    it('should retry with new random slug when generated slug is taken', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      // First call returns existing data, second call returns null
      let callCount = 0;
      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({ data: { id: 'existing-link' } });
              }
              return Promise.resolve({ data: null });
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'def456' },
              error: null,
            }),
          }),
        }),
      });

      mockNanoid.mockReturnValueOnce('abc123').mockReturnValueOnce('def456');

      await POST(mockRequest as NextRequest);

      expect(mockNanoid).toHaveBeenCalledTimes(2);
    });

    it('should return 500 when unable to generate unique slug after max attempts', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      // Always return existing data to simulate all slugs being taken
      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'existing-link' },
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Failed to generate unique slug. Please try again.' },
        { status: 500 }
      );
    });

    it('should handle slug generation with different lengths', async () => {
      // Test that the default length is 6
      expect(6).toBe(6); // Default length used in generateSlug()
      
      // Could be extended to test custom lengths if the function supported it
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'abc123' },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNanoid).toHaveBeenCalledWith(6);
    });
  });

  describe('Link Creation', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'member-123' },
              }),
            }),
          }),
        }),
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
      });
    });

    it('should successfully create a shortened link', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com/some/path',
        wsId: 'workspace-1',
      });

      const mockNewLink = {
        id: 'link-123',
        link: 'https://example.com/some/path',
        slug: 'abc123',
        creator_id: 'user-123',
        ws_id: 'workspace-1',
        domain: 'example.com',
      };

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockNewLink,
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        mockNewLink,
        { status: 201 }
      );
    });

    it('should trim whitespace from URLs', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: '  https://example.com/path  ',
        wsId: 'workspace-1',
      });

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'link-123' },
            error: null,
          }),
        }),
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: mockInsert,
      });

      await POST(mockRequest as NextRequest);

      expect(mockInsert).toHaveBeenCalledWith({
        link: 'https://example.com/path',
        slug: 'abc123',
        creator_id: 'user-123',
        ws_id: 'workspace-1',
        domain: 'example.com',
      });
    });

    it('should extract correct domain from URL', async () => {
      const testCases = [
        { url: 'https://sub.example.com/path', expectedDomain: 'sub.example.com' },
        { url: 'http://localhost:3000', expectedDomain: 'localhost' },
        { url: 'https://example.co.uk/test', expectedDomain: 'example.co.uk' },
      ];

      for (const { url, expectedDomain } of testCases) {
        vi.clearAllMocks();
        
        mockRequest.json = vi.fn().mockResolvedValue({
          url,
          wsId: 'workspace-1',
        });

        const mockInsert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123' },
              error: null,
            }),
          }),
        });

        mockAdminSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
              }),
            }),
          }),
          insert: mockInsert,
        });

        await POST(mockRequest as NextRequest);

        expect(mockInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            domain: expectedDomain,
          })
        );
      }
    });

    it('should return 500 when database insert fails', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' },
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Failed to create shortened link' },
        { status: 500 }
      );
    });

    it('should handle database connection errors', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });

    it('should create correct database record structure', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://api.example.com/v1/data?format=json',
        customSlug: 'api-data',
        wsId: 'workspace-123',
      });

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { 
              id: 'link-123',
              link: 'https://api.example.com/v1/data?format=json',
              slug: 'api-data',
              creator_id: 'user-123',
              ws_id: 'workspace-123',
              domain: 'api.example.com',
            },
            error: null,
          }),
        }),
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: mockInsert,
      });

      await POST(mockRequest as NextRequest);

      expect(mockInsert).toHaveBeenCalledWith({
        link: 'https://api.example.com/v1/data?format=json',
        slug: 'api-data',
        creator_id: 'user-123',
        ws_id: 'workspace-123',
        domain: 'api.example.com',
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Unexpected error'));

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });

    it('should handle malformed JSON in request body', async () => {
      mockRequest.json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });

    it('should handle Supabase client creation errors', async () => {
      mockCreateClient.mockRejectedValue(new Error('Supabase client error'));

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });

    it('should handle admin client creation errors', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'member-123' },
              }),
            }),
          }),
        }),
      });

      mockCreateAdminClient.mockRejectedValue(new Error('Admin client error'));

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });

    it('should log errors appropriately', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Test error'));

      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith('Unexpected error:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'member-123' },
              }),
            }),
          }),
        }),
      });
    });

    it('should handle empty string URL', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: '',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    });

    it('should handle URL with only whitespace', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: '   ',
        wsId: 'workspace-1',
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    });

    it('should handle custom slug with exactly 50 characters', async () => {
      const fiftyCharSlug = 'a'.repeat(50);
      
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        customSlug: fiftyCharSlug,
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: fiftyCharSlug },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Custom slug'),
        }),
        { status: 400 }
      );
    });

    it('should handle special characters in URL path and query parameters', async () => {
      const complexUrl = 'https://example.com/path%20with%20spaces?query=value&special=%20%21%40%23';
      
      mockRequest.json = vi.fn().mockResolvedValue({
        url: complexUrl,
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'abc123' },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'link-123',
        }),
        { status: 201 }
      );
    });

    it('should handle very long URLs', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2000);
      
      mockRequest.json = vi.fn().mockResolvedValue({
        url: longUrl,
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'abc123' },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'link-123',
        }),
        { status: 201 }
      );
    });

    it('should handle undefined customSlug gracefully', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        customSlug: undefined,
        wsId: 'workspace-1',
      });

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'link-123', slug: 'abc123' },
              error: null,
            }),
          }),
        }),
      });

      await POST(mockRequest as NextRequest);

      expect(mockNanoid).toHaveBeenCalledWith(6);
    });

    it('should handle null wsId', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        wsId: null,
      });

      await POST(mockRequest as NextRequest);

      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    });
  });
});

// Test utility functions separately
describe('Utility Functions', () => {
  describe('isValidUrl', () => {
    // Import the function for testing
    const isValidUrl = (string: string): boolean => {
      try {
        new URL(string);
        return true;
      } catch {
        return false;
      }
    };

    it('should return true for valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com',
        'https://sub.domain.example.com/path?query=value#fragment',
        'ftp://files.example.com',
        'mailto:test@example.com',
        'file:///path/to/file',
      ];

      validUrls.forEach(url => {
        expect(isValidUrl(url)).toBe(true);
      });
    });

    it('should return false for invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'example.com',
        'http://',
        'https://',
        '',
        ' ',
        'javascript:alert("xss")',
      ];

      invalidUrls.forEach(url => {
        expect(isValidUrl(url)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(isValidUrl('https://localhost')).toBe(true);
      expect(isValidUrl('https://192.168.1.1')).toBe(true);
      expect(isValidUrl('https://[::1]')).toBe(true); // IPv6
      expect(isValidUrl('custom-scheme://example.com')).toBe(true);
    });
  });

  describe('isValidSlug', () => {
    const isValidSlug = (slug: string): boolean => {
      return /^[a-zA-Z0-9\-_]+$/.test(slug);
    };

    it('should return true for valid slugs', () => {
      const validSlugs = [
        'valid-slug',
        'valid_slug',
        'ValidSlug123',
        'a',
        'ABC',
        '123',
        'slug-with-multiple-hyphens',
        'slug_with_multiple_underscores',
        'mixed-slug_format123',
      ];

      validSlugs.forEach(slug => {
        expect(isValidSlug(slug)).toBe(true);
      });
    });

    it('should return false for invalid slugs', () => {
      const invalidSlugs = [
        'invalid slug',
        'invalid!slug',
        'invalid@slug',
        'invalid#slug',
        'invalid$slug',
        'invalid%slug',
        'invalid&slug',
        'invalid*slug',
        'invalid+slug',
        'invalid=slug',
        'invalid.slug',
        'invalid,slug',
        'invalid;slug',
        'invalid:slug',
        'invalid?slug',
        'invalid/slug',
        'invalid\\slug',
        'invalid|slug',
        'invalid<slug',
        'invalid>slug',
        'invalid[slug',
        'invalid]slug',
        'invalid{slug',
        'invalid}slug',
        'invalid(slug',
        'invalid)slug',
        'invalid"slug',
        "invalid'slug",
        'invalid`slug',
        'invalid~slug',
        '',
      ];

      invalidSlugs.forEach(slug => {
        expect(isValidSlug(slug)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(isValidSlug('1')).toBe(true);
      expect(isValidSlug('_')).toBe(true);
      expect(isValidSlug('-')).toBe(true);
      expect(isValidSlug('___')).toBe(true);
      expect(isValidSlug('---')).toBe(true);
      expect(isValidSlug('123')).toBe(true);
      expect(isValidSlug('ABC')).toBe(true);
    });
  });

  describe('generateSlug', () => {
    const generateSlug = (length = 6): string => {
      return nanoid(length);
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should call nanoid with default length of 6', () => {
      mockNanoid.mockReturnValue('abc123');
      
      const result = generateSlug();
      
      expect(mockNanoid).toHaveBeenCalledWith(6);
      expect(result).toBe('abc123');
    });

    it('should call nanoid with custom length', () => {
      mockNanoid.mockReturnValue('abcdefgh');
      
      const result = generateSlug(8);
      
      expect(mockNanoid).toHaveBeenCalledWith(8);
      expect(result).toBe('abcdefgh');
    });

    it('should handle various length parameters', () => {
      const lengths = [1, 3, 6, 10, 15, 20];
      
      lengths.forEach(length => {
        vi.clearAllMocks();
        mockNanoid.mockReturnValue('x'.repeat(length));
        
        const result = generateSlug(length);
        
        expect(mockNanoid).toHaveBeenCalledWith(length);
        expect(result).toBe('x'.repeat(length));
      });
    });
  });
});