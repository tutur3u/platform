import { createClient } from '@tuturuuu/supabase/next/server';
import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

type BaseErrorResponse = {
  error: string;
};

type ValidationErrorResponse = BaseErrorResponse & {
  statusCode: number;
  details: string;
};

type SimpleErrorResponse = BaseErrorResponse;

type GoogleAuthErrorResponse = BaseErrorResponse & {
  statusCode: number;
  googleError?: string;
  details: {
    requiresReauth?: boolean;
    hasAccessToken?: boolean;
    hasRefreshToken?: boolean;
    userId?: string;
    reason?: string;
    [key: string]: unknown;
  };
};

type SuccessResponse = {
  events: Array<{
    google_event_id: string;
    title: string;
    description?: string;
    start_at: string;
    end_at: string;
    location?: string;
    color?: string;
    ws_id: string;
    locked: boolean;
  }>;
};

type ApiResponse = SimpleErrorResponse | ValidationErrorResponse | GoogleAuthErrorResponse | SuccessResponse;

// Mock dependencies
vi.mock('@tuturuuu/supabase/next/server');
vi.mock('googleapis');
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: ApiResponse, options?: { status?: number }) => {
      const response = { data, options };
      return response as unknown as NextResponse<ApiResponse>;
    }),
  },
}));

describe('Calendar Fetch View API', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
  };

  const mockTokens = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
  };

  const mockGoogleEvents = [
    {
      id: 'event1',
      summary: 'Test Event 1',
      description: 'Test Description 1',
      start: { dateTime: '2024-03-20T10:00:00Z' },
      end: { dateTime: '2024-03-20T11:00:00Z' },
      location: 'Test Location 1',
      colorId: '1',
    },
    {
      id: 'event2',
      summary: 'Test Event 2',
      description: 'Test Description 2',
      start: { dateTime: '2024-03-21T14:00:00Z' },
      end: { dateTime: '2024-03-21T15:00:00Z' },
      location: 'Test Location 2',
      colorId: '2',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Supabase client
    (createClient as any).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: mockTokens,
          error: null,
        }),
      }),
    });

    // Mock Google Calendar API
    (google.calendar as any).mockReturnValue({
      events: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: mockGoogleEvents,
          },
        }),
      },
    });
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      (createClient as any).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error('Not authenticated'),
          }),
        },
      });

      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as SimpleErrorResponse;
      expect(responseData.error).toBe('User not authenticated');
      expect((response as any).options.status).toBe(401);
    });
  });

  describe('Request Validation', () => {
    it('should return 400 when dates are not provided', async () => {
      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as ValidationErrorResponse;
      expect(responseData.error).toBe('Failed to fetch Google Calendar events');
      expect(responseData.statusCode).toBe(400);
      expect(responseData.details).toBe('No dates provided or invalid dates format');
      expect((response as any).options.status).toBe(400);
    });

    it('should return 400 when wsId is not provided', async () => {
      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20'],
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as ValidationErrorResponse;
      expect(responseData.error).toBe('Failed to fetch Google Calendar events');
      expect(responseData.statusCode).toBe(400);
      expect(responseData.details).toBe('Missing workspace ID');
      expect((response as any).options.status).toBe(400);
    });

    it('should return 400 when dates array is empty', async () => {
      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: [],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as ValidationErrorResponse;
      expect(responseData.error).toBe('Failed to fetch Google Calendar events');
      expect(responseData.statusCode).toBe(400);
      expect(responseData.details).toBe('No dates provided or invalid dates format');
      expect((response as any).options.status).toBe(400);
    });
  });

  describe('Database Token Handling', () => {
    it('should return 401 when no tokens are found', async () => {
      (createClient as any).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      });

      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as GoogleAuthErrorResponse;
      expect(responseData.error).toBe('Failed to fetch Google Calendar events');
      expect(responseData.statusCode).toBe(401);
      expect(responseData.googleError).toBe('Google Calendar not authenticated');
      expect(responseData.details.hasAccessToken).toBe(false);
      expect((response as any).options.status).toBe(401);
    });

    it('should handle database errors appropriately', async () => {
      (createClient as any).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Database error' },
          }),
        }),
      });

      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as GoogleAuthErrorResponse;
      expect(responseData.error).toBe('Failed to fetch Google Calendar events');
      expect(responseData.statusCode).toBe(401);
      expect(responseData.googleError).toBe('Google Calendar not authenticated');
      expect(responseData.details.hasAccessToken).toBe(false);
      expect((response as any).options.status).toBe(401);
    });
  });

  describe('Google Calendar API Integration', () => {
    it('should successfully fetch and format calendar events', async () => {
      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20', '2024-03-21'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as SuccessResponse;
      expect(responseData.events).toHaveLength(2);
      expect(responseData.events[0]).toEqual({
        google_event_id: 'event1',
        title: 'Test Event 1',
        description: 'Test Description 1',
        start_at: '2024-03-20T10:00:00Z',
        end_at: '2024-03-20T11:00:00Z',
        location: 'Test Location 1',
        color: '#7986cb',
        ws_id: 'test-ws-id',
        locked: false,
      });
      expect((response as any).options.status).toBe(200);
    });

    it('should handle Google API errors appropriately', async () => {
      (google.calendar as any).mockReturnValue({
        events: {
          list: vi.fn().mockRejectedValue({
            response: {
              status: 401,
              data: {
                error: {
                  message: 'invalid_grant',
                },
              },
            },
          }),
        },
      });

      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as GoogleAuthErrorResponse;
      expect(responseData.error).toBe('Google token invalid, please re-authenticate');
      expect(responseData.details.requiresReauth).toBe(true);
      expect((response as any).options.status).toBe(401);
    });
  });

  describe('Date Handling and Event Filtering', () => {
    it('should filter events to only include those on requested dates', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Event on requested date',
          start: { dateTime: '2024-03-20T10:00:00Z' },
          end: { dateTime: '2024-03-20T11:00:00Z' },
        },
        {
          id: 'event2',
          summary: 'Event outside date range',
          start: { dateTime: '2024-03-25T10:00:00Z' },
          end: { dateTime: '2024-03-25T11:00:00Z' },
        },
      ];

      (google.calendar as any).mockReturnValue({
        events: {
          list: vi.fn().mockResolvedValue({
            data: {
              items: mockEvents,
            },
          }),
        },
      });

      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['2024-03-20'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as SuccessResponse;
      expect(responseData.events).toHaveLength(1);
      expect(responseData.events[0]!.google_event_id).toBe('event1');
      expect((response as any).options.status).toBe(200);
    });

    it('should handle invalid date formats', async () => {
      const request = new Request('http://localhost:7803/api/v1/calendar/auth/fetch-view', {
        method: 'POST',
        body: JSON.stringify({
          dates: ['invalid-date'],
          wsId: 'test-ws-id',
        }),
      });

      const response = await POST(request);
      const responseData = (response as any).data as SimpleErrorResponse;
      expect(responseData.error).toBe('Failed to fetch Google Calendar events');
    });
  });
}); 