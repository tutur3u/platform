import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase modules
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, options) => ({
      json: () => data,
      status: options?.status || 200,
    })),
  },
}));

describe('Calendar Sync Dashboard APIs', () => {
  let mockAdminClient: any;
  let mockClient: any;
  let mockNextResponse: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock admin client
    mockAdminClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(),
            })),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
          in: vi.fn(() => ({
            order: vi.fn(),
          })),
        })),
      })),
    };

    // Setup mock regular client
    mockClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
          in: vi.fn(() => ({
            order: vi.fn(),
          })),
        })),
      })),
    };

    // Setup NextResponse mock
    mockNextResponse = {
      json: vi.fn((data, options) => ({
        json: () => data,
        status: options?.status || 200,
      })),
    };

    // Mock the module functions
    (createAdminClient as any).mockResolvedValue(mockAdminClient);
    (createClient as any).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/calendar/sync-dashboard/insert', () => {
    it('should successfully insert a sync dashboard record', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      // Mock successful insert
      const mockInsertData = {
        id: 'test-record-id',
        ws_id: 'test-workspace-id',
        triggered_by: 'test-user-id',
        start_time: '2024-01-01T10:00:00Z',
        end_time: '2024-01-01T11:00:00Z',
        status: 'completed',
        type: 'active',
        inserted_events: 5,
        updated_events: 2,
        deleted_events: 1,
      };

      mockAdminClient.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: mockInsertData, error: null })
            ),
          })),
        })),
      });

      // Import the route handler
      const { POST } = await import(
        '@/app/api/v1/calendar/sync-dashboard/insert/route'
      );

      // Create request body
      const requestBody = {
        ws_id: 'test-workspace-id',
        triggered_by: 'test-user-id',
        status: 'completed',
        type: 'active',
        inserted_events: 5,
        updated_events: 2,
        deleted_events: 1,
      };

      // Create mock request
      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/insert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      // Call the handler
      const response = await POST(request);
      const responseData = await response.json();

      // Assertions
      expect(mockAdminClient.auth.getUser).toHaveBeenCalled();
      expect(mockAdminClient.from).toHaveBeenCalledWith(
        'calendar_sync_dashboard'
      );
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(mockInsertData);
    });

    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/sync-dashboard/insert/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/insert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ws_id: 'test-workspace-id' }),
        }
      );

      const response = await POST(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('Unauthorized');
    });

    it('should return 400 when ws_id is missing', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/sync-dashboard/insert/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/insert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ triggered_by: 'test-user-id' }),
        }
      );

      const response = await POST(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('ws_id is required');
    });

    it('should handle database errors gracefully', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      // Mock database error
      mockAdminClient.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: { message: 'Database error' },
              })
            ),
          })),
        })),
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/sync-dashboard/insert/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/insert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ws_id: 'test-workspace-id' }),
        }
      );

      const response = await POST(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('Failed to insert sync dashboard record');
      expect(responseData.details).toBe('Database error');
    });
  });

  describe('PUT /api/v1/calendar/sync-dashboard/update', () => {
    it('should successfully update a sync dashboard record', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      // Mock successful update
      const mockUpdateData = {
        id: 'test-record-id',
        ws_id: 'test-workspace-id',
        status: 'completed',
        end_time: '2024-01-01T11:00:00Z',
        inserted_events: 10,
        updated_events: 5,
        deleted_events: 2,
      };

      mockAdminClient.from.mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: mockUpdateData, error: null })
              ),
            })),
          })),
        })),
      });

      const { PUT } = await import(
        '@/app/api/v1/calendar/sync-dashboard/update/route'
      );

      const requestBody = {
        id: 'test-record-id',
        status: 'completed',
        end_time: '2024-01-01T11:00:00Z',
        inserted_events: 10,
        updated_events: 5,
        deleted_events: 2,
      };

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/update',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      const response = await PUT(request);
      const responseData = await response.json();

      expect(mockAdminClient.auth.getUser).toHaveBeenCalled();
      expect(mockAdminClient.from).toHaveBeenCalledWith(
        'calendar_sync_dashboard'
      );
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(mockUpdateData);
    });

    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const { PUT } = await import(
        '@/app/api/v1/calendar/sync-dashboard/update/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/update',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'test-record-id' }),
        }
      );

      const response = await PUT(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('Unauthorized');
    });

    it('should return 400 when id is missing', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      const { PUT } = await import(
        '@/app/api/v1/calendar/sync-dashboard/update/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/update',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        }
      );

      const response = await PUT(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('id is required');
    });

    it('should return 404 when record is not found', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      // Mock no data returned
      mockAdminClient.from.mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      });

      const { PUT } = await import(
        '@/app/api/v1/calendar/sync-dashboard/update/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/update',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'non-existent-id' }),
        }
      );

      const response = await PUT(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('Sync dashboard record not found');
    });

    it('should handle database errors gracefully', async () => {
      // Mock successful authentication
      mockAdminClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });

      // Mock database error
      mockAdminClient.from.mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: null,
                  error: { message: 'Database error' },
                })
              ),
            })),
          })),
        })),
      });

      const { PUT } = await import(
        '@/app/api/v1/calendar/sync-dashboard/update/route'
      );

      const request = new Request(
        'http://localhost/api/v1/calendar/sync-dashboard/update',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'test-record-id' }),
        }
      );

      const response = await PUT(request);
      const responseData = await response.json();

      expect(responseData.error).toBe('Failed to update sync dashboard record');
      expect(responseData.details).toBe('Database error');
    });
  });

  describe('GET /api/sync-logs', () => {
    it('should successfully fetch sync logs for user with workspace access', async () => {
      // Mock successful authentication
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      });

      // Mock workspace memberships
      const mockWorkspaceMemberships = [
        { ws_id: 'workspace-1' },
        { ws_id: 'workspace-2' },
      ];

      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: mockWorkspaceMemberships, error: null })
          ),
        })),
      });

      // Mock sync logs data
      const mockSyncLogs = [
        {
          id: 'log-1',
          time: '2024-01-01T10:00:00Z',
          start_time: '2024-01-01T10:00:00Z',
          end_time: '2024-01-01T11:00:00Z',
          type: 'background',
          ws_id: 'workspace-1',
          triggered_by: 'user-1',
          status: 'completed',
          inserted_events: 5,
          updated_events: 2,
          deleted_events: 1,
          workspaces: { id: 'workspace-1', name: 'Test Workspace' },
          users: { id: 'user-1', display_name: 'Test User', avatar_url: null },
        },
      ];

      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({ data: mockSyncLogs, error: null })
            ),
          })),
        })),
      });

      const { GET } = await import('@/app/api/sync-logs/route');

      const request = new Request('http://localhost/api/sync-logs');

      const response = await GET(request);
      const responseData = await response.json();

      expect(mockClient.auth.getUser).toHaveBeenCalled();
      expect(responseData).toHaveLength(1);
      expect(responseData[0]).toMatchObject({
        id: 'log-1',
        timestamp: '2024-01-01T10:00:00Z',
        type: 'background',
        workspace: { id: 'workspace-1', name: 'Test Workspace' },
        triggeredBy: {
          id: 'user-1',
          display_name: 'Test User',
          avatar_url: null,
        },
        status: 'completed',
        events: {
          added: 5,
          updated: 2,
          deleted: 1,
        },
        calendarSource: 'Google Calendar',
        error: null,
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      // Mock authentication error
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Unauthorized' },
      });

      const { GET } = await import('@/app/api/sync-logs/route');

      const request = new Request('http://localhost/api/sync-logs');

      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData.message).toBe('Unauthorized');
    });

    it('should return empty array when user has no workspace access', async () => {
      // Mock successful authentication
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      });

      // Mock no workspace memberships
      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      });

      const { GET } = await import('@/app/api/sync-logs/route');

      const request = new Request('http://localhost/api/sync-logs');

      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      // Mock successful authentication
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      });

      // Mock workspace memberships
      const mockWorkspaceMemberships = [{ ws_id: 'workspace-1' }];

      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: mockWorkspaceMemberships, error: null })
          ),
        })),
      });

      // Mock database error
      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: { message: 'Database error' },
              })
            ),
          })),
        })),
      });

      const { GET } = await import('@/app/api/sync-logs/route');

      const request = new Request('http://localhost/api/sync-logs');

      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData.message).toBe('Error fetching sync logs');
      expect(responseData.details).toBe('Database error');
    });

    it('should fallback to admin client when regular client fails', async () => {
      // Mock successful authentication
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      });

      // Mock workspace memberships
      const mockWorkspaceMemberships = [{ ws_id: 'workspace-1' }];

      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: mockWorkspaceMemberships, error: null })
          ),
        })),
      });

      // Mock regular client failure, then admin client success
      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: { message: 'Permission denied' },
              })
            ),
          })),
        })),
      });

      const mockSyncLogs = [
        {
          id: 'log-1',
          time: '2024-01-01T10:00:00Z',
          start_time: '2024-01-01T10:00:00Z',
          end_time: '2024-01-01T11:00:00Z',
          type: 'background',
          ws_id: 'workspace-1',
          triggered_by: 'user-1',
          status: 'completed',
          inserted_events: 5,
          updated_events: 2,
          deleted_events: 1,
          workspaces: { id: 'workspace-1', name: 'Test Workspace' },
          users: { id: 'user-1', display_name: 'Test User', avatar_url: null },
        },
      ];

      mockAdminClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({ data: mockSyncLogs, error: null })
            ),
          })),
        })),
      });

      const { GET } = await import('@/app/api/sync-logs/route');

      const request = new Request('http://localhost/api/sync-logs');

      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData).toHaveLength(1);
      expect(responseData[0].id).toBe('log-1');
    });

    it('should calculate duration correctly', async () => {
      // Mock successful authentication
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      });

      // Mock workspace memberships
      const mockWorkspaceMemberships = [{ ws_id: 'workspace-1' }];

      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: mockWorkspaceMemberships, error: null })
          ),
        })),
      });

      // Mock sync logs with duration
      const mockSyncLogs = [
        {
          id: 'log-1',
          time: '2024-01-01T10:00:00Z',
          start_time: '2024-01-01T10:00:00Z',
          end_time: '2024-01-01T10:30:00Z', // 30 minutes duration
          type: 'background',
          ws_id: 'workspace-1',
          triggered_by: 'user-1',
          status: 'completed',
          inserted_events: 5,
          updated_events: 2,
          deleted_events: 1,
          workspaces: { id: 'workspace-1', name: 'Test Workspace' },
          users: { id: 'user-1', display_name: 'Test User', avatar_url: null },
        },
      ];

      mockClient.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({ data: mockSyncLogs, error: null })
            ),
          })),
        })),
      });

      const { GET } = await import('@/app/api/sync-logs/route');

      const request = new Request('http://localhost/api/sync-logs');

      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData[0].duration).toBe(30 * 60 * 1000); // 30 minutes in milliseconds
    });
  });
});
