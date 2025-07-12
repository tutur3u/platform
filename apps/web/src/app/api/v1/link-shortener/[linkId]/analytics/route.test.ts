import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from './route';
import { createAdminClient, createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

// Mock the Supabase clients
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn(),
  },
}));

describe('Link Analytics API Route - GET', () => {
  let mockSupabase: any;
  let mockAdminSupabase: any;
  let mockRequest: NextRequest;
  let mockParams: { params: Promise<{ linkId: string }> };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock Supabase clients
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };

    mockAdminSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn(),
      not: vi.fn().mockReturnThis(),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase);
    vi.mocked(createAdminClient).mockResolvedValue(mockAdminSupabase);

    // Setup mock request and params
    mockRequest = {} as NextRequest;
    mockParams = {
      params: Promise.resolve({ linkId: 'test-link-id-123' }),
    };

    // Setup NextResponse.json mock
    vi.mocked(NextResponse.json).mockImplementation((data, options) => ({
      json: () => data,
      status: options?.status || 200,
    } as any));
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 when user ID is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: {} },
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 when user is undefined', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: undefined },
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 404 when link is not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockAdminSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Link not found'),
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Link not found' },
        { status: 404 }
      );
    });

    it('should return 404 when link data is null', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockAdminSupabase.single.mockResolvedValue({
        data: null,
        error: null,
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Link not found' },
        { status: 404 }
      );
    });

    it('should return 403 when user is not a workspace member', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      });

      mockAdminSupabase.single.mockResolvedValue({
        data: {
          id: 'link-123',
          ws_id: 'workspace-456',
          slug: 'test-slug',
          link: 'https://example.com',
          creator_id: 'creator-789',
          created_at: '2023-01-01T00:00:00Z',
        },
        error: null,
      });

      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Forbidden' },
        { status: 403 }
      );
    });

    it('should proceed when user is a valid workspace member', async () => {
      const mockUser = { id: 'user-123' };
      const mockLink = {
        id: 'link-123',
        ws_id: 'workspace-456',
        slug: 'test-slug',
        link: 'https://example.com',
        creator_id: 'creator-789',
        created_at: '2023-01-01T00:00:00Z',
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockAdminSupabase.single
        .mockResolvedValueOnce({ data: mockLink, error: null })
        .mockResolvedValueOnce({ data: null, error: new Error('No analytics') });

      mockSupabase.maybeSingle.mockResolvedValue({
        data: { ws_id: 'workspace-456', user_id: 'user-123' },
      });

      await GET(mockRequest, mockParams);

      expect(mockSupabase.from).toHaveBeenCalledWith('workspace_members');
      expect(mockSupabase.eq).toHaveBeenCalledWith('ws_id', mockLink.ws_id);
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', mockUser.id);
    });
  });

  describe('Analytics Data Retrieval', () => {
    const mockUser = { id: 'user-123' };
    const mockLink = {
      id: 'link-123',
      ws_id: 'workspace-456',
      slug: 'test-slug',
      link: 'https://example.com',
      creator_id: 'creator-789',
      created_at: '2023-01-01T00:00:00Z',
    };
    const mockWorkspaceMember = { ws_id: 'workspace-456', user_id: 'user-123' };

    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockAdminSupabase.single.mockResolvedValueOnce({
        data: mockLink,
        error: null,
      });

      mockSupabase.maybeSingle.mockResolvedValue({
        data: mockWorkspaceMember,
      });
    });

    it('should return analytics data when summary exists', async () => {
      const mockSummary = {
        total_clicks: 100,
        unique_visitors: 75,
        unique_referrers: 5,
        unique_countries: 3,
        first_click_at: '2023-01-02T00:00:00Z',
        last_click_at: '2023-01-10T00:00:00Z',
        top_referrer_domain: 'google.com',
        top_country: 'US',
      };

      mockAdminSupabase.single.mockResolvedValueOnce({ data: mockSummary, error: null });

      const mockClicksByDay = [
        { clicked_at: '2023-01-01T10:00:00Z' },
        { clicked_at: '2023-01-01T11:00:00Z' },
        { clicked_at: '2023-01-02T09:00:00Z' },
      ];

      const mockTopReferrers = [
        { referrer_domain: 'google.com' },
        { referrer_domain: 'google.com' },
        { referrer_domain: 'facebook.com' },
      ];

      const mockTopCountries = [
        { country: 'US' },
        { country: 'US' },
        { country: 'CA' },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: mockClicksByDay })
        .mockResolvedValueOnce({ data: mockTopReferrers })
        .mockResolvedValueOnce({ data: mockTopCountries });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          link: {
            id: mockLink.id,
            slug: mockLink.slug,
            original_url: mockLink.link,
            created_at: mockLink.created_at,
          },
          analytics: expect.objectContaining({
            total_clicks: 100,
            unique_visitors: 75,
            unique_referrers: 5,
            unique_countries: 3,
            first_click_at: '2023-01-02T00:00:00Z',
            last_click_at: '2023-01-10T00:00:00Z',
            top_referrer_domain: 'google.com',
            top_country: 'US',
          }),
          clicksByDay: expect.any(Array),
          topReferrers: expect.any(Array),
          topCountries: expect.any(Array),
        })
      );
    });

    it('should return zero stats when no analytics data exists', async () => {
      mockAdminSupabase.single.mockResolvedValueOnce({ 
        data: null, 
        error: new Error('No analytics summary found') 
      });

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          link: {
            id: mockLink.id,
            slug: mockLink.slug,
            original_url: mockLink.link,
            created_at: mockLink.created_at,
          },
          analytics: {
            total_clicks: 0,
            unique_visitors: 0,
            unique_referrers: 0,
            unique_countries: 0,
            first_click_at: null,
            last_click_at: null,
            top_referrer_domain: null,
            top_country: null,
          },
          clicksByDay: [],
          topReferrers: [],
          topCountries: [],
        })
      );
    });

    it('should handle summary with null values gracefully', async () => {
      const mockSummary = {
        total_clicks: null,
        unique_visitors: null,
        unique_referrers: null,
        unique_countries: null,
        first_click_at: null,
        last_click_at: null,
        top_referrer_domain: null,
        top_country: null,
      };

      mockAdminSupabase.single.mockResolvedValueOnce({ data: mockSummary, error: null });
      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.analytics.total_clicks).toBe(0);
      expect(callArgs.analytics.unique_visitors).toBe(0);
      expect(callArgs.analytics.unique_referrers).toBe(0);
      expect(callArgs.analytics.unique_countries).toBe(0);
    });
  });

  describe('Data Processing Logic', () => {
    const mockUser = { id: 'user-123' };
    const mockLink = {
      id: 'link-123',
      ws_id: 'workspace-456',
      slug: 'test-slug',
      link: 'https://example.com',
      creator_id: 'creator-789',
      created_at: '2023-01-01T00:00:00Z',
    };
    const mockWorkspaceMember = { ws_id: 'workspace-456', user_id: 'user-123' };
    const mockSummary = {
      total_clicks: 100,
      unique_visitors: 75,
      unique_referrers: 5,
      unique_countries: 3,
      first_click_at: '2023-01-02T00:00:00Z',
      last_click_at: '2023-01-10T00:00:00Z',
      top_referrer_domain: 'google.com',
      top_country: 'US',
    };

    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockAdminSupabase.single
        .mockResolvedValueOnce({ data: mockLink, error: null })
        .mockResolvedValueOnce({ data: mockSummary, error: null });

      mockSupabase.maybeSingle.mockResolvedValue({
        data: mockWorkspaceMember,
      });
    });

    it('should correctly process clicks by day data', async () => {
      const mockClicksByDay = [
        { clicked_at: '2023-01-01T10:00:00Z' },
        { clicked_at: '2023-01-01T11:00:00Z' },
        { clicked_at: '2023-01-02T09:00:00Z' },
        { clicked_at: '2023-01-02T15:00:00Z' },
        { clicked_at: '2023-01-03T12:00:00Z' },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: mockClicksByDay })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.clicksByDay).toEqual(
        expect.arrayContaining([
          { date: '2023-01-01', clicks: 2 },
          { date: '2023-01-02', clicks: 2 },
          { date: '2023-01-03', clicks: 1 },
        ])
      );
    });

    it('should handle clicks with invalid dates gracefully', async () => {
      const mockClicksByDay = [
        { clicked_at: '2023-01-01T10:00:00Z' },
        { clicked_at: null },
        { clicked_at: 'invalid-date' },
        { clicked_at: '2023-01-02T09:00:00Z' },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: mockClicksByDay })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.clicksByDay.length).toBeGreaterThan(0);
      expect(callArgs.clicksByDay.every((day: any) => day.date && day.clicks >= 0)).toBe(true);
    });

    it('should correctly aggregate top referrers', async () => {
      const mockTopReferrers = [
        { referrer_domain: 'google.com' },
        { referrer_domain: 'google.com' },
        { referrer_domain: 'google.com' },
        { referrer_domain: 'facebook.com' },
        { referrer_domain: 'facebook.com' },
        { referrer_domain: 'twitter.com' },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: mockTopReferrers })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.topReferrers).toEqual([
        { domain: 'google.com', count: 3 },
        { domain: 'facebook.com', count: 2 },
        { domain: 'twitter.com', count: 1 },
      ]);
    });

    it('should correctly aggregate top countries', async () => {
      const mockTopCountries = [
        { country: 'US' },
        { country: 'US' },
        { country: 'US' },
        { country: 'CA' },
        { country: 'CA' },
        { country: 'UK' },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: mockTopCountries });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.topCountries).toEqual([
        { country: 'US', count: 3 },
        { country: 'CA', count: 2 },
        { country: 'UK', count: 1 },
      ]);
    });

    it('should limit top referrers to 10 items', async () => {
      const mockTopReferrers = Array.from({ length: 15 }, (_, i) => ({
        referrer_domain: `domain${i}.com`,
      }));

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: mockTopReferrers })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.topReferrers).toHaveLength(10);
    });

    it('should limit top countries to 10 items', async () => {
      const mockTopCountries = Array.from({ length: 15 }, (_, i) => ({
        country: `Country${i}`,
      }));

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: mockTopCountries });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.topCountries).toHaveLength(10);
    });

    it('should filter out null and empty referrer domains', async () => {
      const mockTopReferrers = [
        { referrer_domain: 'google.com' },
        { referrer_domain: null },
        { referrer_domain: '' },
        { referrer_domain: 'facebook.com' },
        { referrer_domain: undefined },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: mockTopReferrers })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.topReferrers).toEqual([
        { domain: 'google.com', count: 1 },
        { domain: 'facebook.com', count: 1 },
      ]);
    });

    it('should filter out null and empty countries', async () => {
      const mockTopCountries = [
        { country: 'US' },
        { country: null },
        { country: '' },
        { country: 'CA' },
        { country: undefined },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: mockTopCountries });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.topCountries).toEqual([
        { country: 'US', count: 1 },
        { country: 'CA', count: 1 },
      ]);
    });

    it('should handle empty arrays for analytics data', async () => {
      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.clicksByDay).toEqual([]);
      expect(callArgs.topReferrers).toEqual([]);
      expect(callArgs.topCountries).toEqual([]);
    });

    it('should handle null data responses gracefully', async () => {
      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({ data: null });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      expect(callArgs.clicksByDay).toEqual([]);
      expect(callArgs.topReferrers).toEqual([]);
      expect(callArgs.topCountries).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when an unexpected error occurs during user auth', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database connection failed'));

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testError = new Error('Test error');
      
      mockSupabase.auth.getUser.mockRejectedValue(testError);

      await GET(mockRequest, mockParams);

      expect(consoleSpy).toHaveBeenCalledWith('Analytics API error:', testError);
      
      consoleSpy.mockRestore();
    });

    it('should handle malformed params gracefully', async () => {
      const malformedParams = {
        params: Promise.reject(new Error('Invalid params')),
      };

      await GET(mockRequest, malformedParams as any);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    });

    it('should handle Supabase client creation errors', async () => {
      vi.mocked(createClient).mockRejectedValue(new Error('Failed to create client'));

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    });

    it('should handle admin client creation errors', async () => {
      vi.mocked(createAdminClient).mockRejectedValue(new Error('Failed to create admin client'));

      await GET(mockRequest, mockParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    });
  });

  describe('Database Query Patterns', () => {
    const mockUser = { id: 'user-123' };
    const mockLink = {
      id: 'link-123',
      ws_id: 'workspace-456',
      slug: 'test-slug',
      link: 'https://example.com',
      creator_id: 'creator-789',
      created_at: '2023-01-01T00:00:00Z',
    };

    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockAdminSupabase.single.mockResolvedValue({
        data: mockLink,
        error: null,
      });

      mockSupabase.maybeSingle.mockResolvedValue({
        data: { ws_id: 'workspace-456', user_id: 'user-123' },
      });
    });

    it('should query analytics data within the last 30 days', async () => {
      const mockSummary = { total_clicks: 10 };
      mockAdminSupabase.single
        .mockResolvedValueOnce({ data: mockLink, error: null })
        .mockResolvedValueOnce({ data: mockSummary, error: null });

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      expect(mockAdminSupabase.gte).toHaveBeenCalledWith(
        'clicked_at',
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
      );
    });

    it('should correctly select required fields for shortened links', async () => {
      await GET(mockRequest, mockParams);

      expect(mockAdminSupabase.select).toHaveBeenCalledWith(
        'id, ws_id, slug, link, creator_id, created_at'
      );
    });

    it('should query workspace membership correctly', async () => {
      await GET(mockRequest, mockParams);

      expect(mockSupabase.from).toHaveBeenCalledWith('workspace_members');
      expect(mockSupabase.eq).toHaveBeenCalledWith('ws_id', mockLink.ws_id);
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', mockUser.id);
    });

    it('should filter out null referrer domains in query', async () => {
      const mockSummary = { total_clicks: 10 };
      mockAdminSupabase.single
        .mockResolvedValueOnce({ data: mockLink, error: null })
        .mockResolvedValueOnce({ data: mockSummary, error: null });

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      expect(mockAdminSupabase.not).toHaveBeenCalledWith('referrer_domain', 'is', null);
      expect(mockAdminSupabase.not).toHaveBeenCalledWith('referrer_domain', 'eq', '');
    });

    it('should filter out null countries in query', async () => {
      const mockSummary = { total_clicks: 10 };
      mockAdminSupabase.single
        .mockResolvedValueOnce({ data: mockLink, error: null })
        .mockResolvedValueOnce({ data: mockSummary, error: null });

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      await GET(mockRequest, mockParams);

      expect(mockAdminSupabase.not).toHaveBeenCalledWith('country', 'is', null);
      expect(mockAdminSupabase.not).toHaveBeenCalledWith('country', 'eq', '');
    });
  });

  describe('Edge Cases and Data Validation', () => {
    const mockUser = { id: 'user-123' };
    const mockLink = {
      id: 'link-123',
      ws_id: 'workspace-456',
      slug: 'test-slug',
      link: 'https://example.com',
      creator_id: 'creator-789',
      created_at: '2023-01-01T00:00:00Z',
    };
    const mockSummary = { total_clicks: 10 };

    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
      });

      mockAdminSupabase.single
        .mockResolvedValueOnce({ data: mockLink, error: null })
        .mockResolvedValueOnce({ data: mockSummary, error: null });

      mockSupabase.maybeSingle.mockResolvedValue({
        data: { ws_id: 'workspace-456', user_id: 'user-123' },
      });
    });

    it('should handle empty linkId parameter', async () => {
      const emptyParams = {
        params: Promise.resolve({ linkId: '' }),
      };

      await GET(mockRequest, emptyParams);

      expect(mockAdminSupabase.eq).toHaveBeenCalledWith('id', '');
    });

    it('should handle very long linkId parameter', async () => {
      const longLinkId = 'a'.repeat(1000);
      const longParams = {
        params: Promise.resolve({ linkId: longLinkId }),
      };

      await GET(mockRequest, longParams);

      expect(mockAdminSupabase.eq).toHaveBeenCalledWith('id', longLinkId);
    });

    it('should handle special characters in linkId', async () => {
      const specialLinkId = 'link-123!@#$%^&*()';
      const specialParams = {
        params: Promise.resolve({ linkId: specialLinkId }),
      };

      await GET(mockRequest, specialParams);

      expect(mockAdminSupabase.eq).toHaveBeenCalledWith('id', specialLinkId);
    });

    it('should maintain data consistency across multiple aggregations', async () => {
      const complexClicksData = [
        { clicked_at: '2023-01-01T10:00:00Z' },
        { clicked_at: '2023-01-01T11:00:00Z' },
        { clicked_at: '2023-01-01T12:00:00Z' },
      ];

      const complexReferrers = [
        { referrer_domain: 'google.com' },
        { referrer_domain: 'google.com' },
        { referrer_domain: 'bing.com' },
      ];

      const complexCountries = [
        { country: 'US' },
        { country: 'US' },
        { country: 'CA' },
      ];

      mockAdminSupabase.order
        .mockResolvedValueOnce({ data: complexClicksData })
        .mockResolvedValueOnce({ data: complexReferrers })
        .mockResolvedValueOnce({ data: complexCountries });

      await GET(mockRequest, mockParams);

      const callArgs = vi.mocked(NextResponse.json).mock.calls[0][0];
      
      // Verify data consistency
      expect(callArgs.clicksByDay[0].clicks).toBe(3);
      expect(callArgs.topReferrers[0].count).toBe(2);
      expect(callArgs.topCountries[0].count).toBe(2);
    });
  });
});